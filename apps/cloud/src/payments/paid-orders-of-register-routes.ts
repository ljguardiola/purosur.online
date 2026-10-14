import {
  type ApprovedOrdersOfRegisterBody,
  approvedOrdersOfRegisterSchema,
  cloudError,
  cloudErrorStatus,
  type LatePaymentRefundRefusalDetail,
  latePaymentRefundOpeningSchema,
} from "@purosur/contracts";
import {
  openRegisterLatePaymentRefund,
  readApprovedOrdersOfRegister,
} from "@purosur/domain/payments/use-cases";
import { admitInstallationRequest } from "@purosur/domain/sync/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { DedicatedConnections } from "../platform/dedicated-connections.js";
import { sendRateLimited } from "../platform/rate-limited-response.js";
import { readRecordIds } from "../platform/record-id-params.js";
import { answerErrorsWithCloudEnvelope } from "../register/cloud-error-handler.js";
import { authenticateDevice } from "../register/device-authentication.js";
import {
  type DeviceTokensOptions,
  installationTokenPorts,
} from "../register/installation-token-ports.js";
import { PUBLIC_ACCESS } from "../sessions/route-access.js";
import { DrizzleRequestAdmission } from "../sync/drizzle-request-admission.js";
import { DrizzleApprovedOrdersOfRegister } from "./drizzle-approved-orders-of-register.js";
import { DrizzlePaymentTransactionLanes } from "./drizzle-payment-transaction-lanes.js";

export type PaidOrdersOfRegisterRoutesOptions<TQueryResult extends PgQueryResultHKT> =
  DeviceTokensOptions<TQueryResult> & {
    connections: DedicatedConnections<TQueryResult>;
  };

const DEVICE_TOKEN_REJECTED = cloudError(
  "device_token_rejected",
  "the device token is not recognized",
);
const REVOKED = cloudError("revoked", "this installation was revoked");
const PAYMENT_NOT_OWNED = cloudError("not_found", "that payment is not this register's");

function refusalError(refusal: LatePaymentRefundRefusalDetail["refusal"], message: string) {
  return cloudError("conflict", message, [{ refusal }]);
}

const NOT_APPROVED = refusalError("not_approved", "that payment was not approved");
const REPLACED = refusalError("replaced", "that payment was replaced by another order");
const HELD_BY_SALE = refusalError("held_by_sale", "a sale this register synced holds that payment");

function toWire(
  orders: Awaited<ReturnType<typeof readApprovedOrdersOfRegister>>["orders"],
): ApprovedOrdersOfRegisterBody {
  return {
    orders: orders.map((order) => ({
      payment_transaction_id: order.paymentTransactionId,
      sale_id: order.saleId,
      method: order.method,
      provider: order.provider,
      amount: order.amount,
      created_at: order.createdAt.toISOString(),
    })),
  };
}

// Public to the backoffice's session guard: the device token is these routes' own authentication.
export function registerPaidOrdersOfRegisterRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PaidOrdersOfRegisterRoutesOptions<TQueryResult>,
): void {
  const tokenPorts = installationTokenPorts(options);
  const clock = { now: options.now };
  const admission = { admission: new DrizzleRequestAdmission(options.db), clock };
  const lanes = new DrizzlePaymentTransactionLanes(options.connections);
  const orders = new DrizzleApprovedOrdersOfRegister(options.db);

  async function installationRegisterId(
    authorization: string | undefined,
    reply: FastifyReply,
  ): Promise<string | undefined> {
    const authentication = await authenticateDevice(tokenPorts, authorization);
    if (authentication.kind !== "installation") {
      await reply
        .code(cloudErrorStatus(DEVICE_TOKEN_REJECTED.code))
        .header("WWW-Authenticate", "Bearer")
        .send(DEVICE_TOKEN_REJECTED);
      return undefined;
    }
    if (authentication.installation.revoked) {
      await reply.code(cloudErrorStatus(REVOKED.code)).send(REVOKED);
      return undefined;
    }

    const admitted = await admitInstallationRequest(admission, {
      deviceId: authentication.installation.deviceId,
      endpoint: "payment_order",
    });
    if (admitted.kind === "rate_limited") {
      await sendRateLimited(reply, "too many requests", admitted.retryAfterSeconds);
      return undefined;
    }
    return authentication.installation.registerId;
  }

  app.register(async (scope) => {
    answerErrorsWithCloudEnvelope(scope);

    scope.get(
      "/payments/mercado-pago/approved",
      { config: { access: PUBLIC_ACCESS } },
      async (request, reply) => {
        const registerId = await installationRegisterId(request.headers.authorization, reply);
        if (registerId === undefined) {
          return;
        }
        const outcome = await readApprovedOrdersOfRegister({ orders, clock }, { registerId });
        await reply.code(200).send(approvedOrdersOfRegisterSchema.parse(toWire(outcome.orders)));
      },
    );

    scope.post(
      "/payments/mercado-pago/:id/late-payment-refund",
      { config: { access: PUBLIC_ACCESS } },
      async (request, reply) => {
        const registerId = await installationRegisterId(request.headers.authorization, reply);
        if (registerId === undefined) {
          return;
        }
        const ids = await readRecordIds(reply, request.params, ["id"]);
        if (!ids) {
          return;
        }

        const outcome = await openRegisterLatePaymentRefund(
          { lanes, clock },
          { registerId, paymentTransactionId: ids.id },
        );

        switch (outcome.kind) {
          case "opened":
          case "already_open":
            await reply.code(200).send(
              latePaymentRefundOpeningSchema.parse({
                payment_transaction_id: ids.id,
                opening: outcome.kind,
              }),
            );
            return;
          case "not_found":
            await reply.code(cloudErrorStatus(PAYMENT_NOT_OWNED.code)).send(PAYMENT_NOT_OWNED);
            return;
          case "not_approved":
            await reply.code(cloudErrorStatus(NOT_APPROVED.code)).send(NOT_APPROVED);
            return;
          case "replaced":
            await reply.code(cloudErrorStatus(REPLACED.code)).send(REPLACED);
            return;
          case "held_by_sale":
            await reply.code(cloudErrorStatus(HELD_BY_SALE.code)).send(HELD_BY_SALE);
            return;
        }
      },
    );
  });
}
