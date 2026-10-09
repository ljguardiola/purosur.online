import {
  cloudError,
  cloudErrorStatus,
  type MercadoPagoQrPaymentBody,
  mercadoPagoQrOrderRequestSchema,
  mercadoPagoQrPaymentSchema,
} from "@purosur/contracts";
import type { ProviderPaymentTransaction } from "@purosur/domain";
import {
  createMercadoPagoQrOrder,
  type MercadoPagoOrders,
  readMercadoPagoQrPayment,
} from "@purosur/domain/payments/use-cases";
import { admitInstallationRequest } from "@purosur/domain/sync/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { DedicatedConnections } from "../platform/dedicated-connections.js";
import { sendRateLimited } from "../platform/rate-limited-response.js";
import { readRecordIds } from "../platform/record-id-params.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { answerErrorsWithCloudEnvelope } from "../register/cloud-error-handler.js";
import { authenticateDevice } from "../register/device-authentication.js";
import {
  type DeviceTokensOptions,
  installationTokenPorts,
} from "../register/installation-token-ports.js";
import { PUBLIC_ACCESS } from "../sessions/route-access.js";
import { DrizzleRequestAdmission } from "../sync/drizzle-request-admission.js";
import { DrizzlePaymentTransactionLanes } from "./drizzle-payment-transaction-lanes.js";

export type MercadoPagoQrRoutesOptions<TQueryResult extends PgQueryResultHKT> =
  DeviceTokensOptions<TQueryResult> & {
    connections: DedicatedConnections<TQueryResult>;
    mercadoPago?: MercadoPagoOrders;
  };

const DEVICE_TOKEN_REJECTED = cloudError(
  "device_token_rejected",
  "the device token is not recognized",
);
const REVOKED = cloudError("revoked", "this installation was revoked");
const PROVIDER_NOT_CONFIGURED = cloudError(
  "payment_provider_not_configured",
  "the payment provider is not configured",
);
const PROVIDER_REFUSED = cloudError(
  "payment_provider_refused",
  "the payment provider refused the order",
);
const PROVIDER_UNAVAILABLE = cloudError(
  "payment_provider_unavailable",
  "the payment provider could not be reached",
);
const REQUEST_MISMATCH = cloudError(
  "conflict",
  "that payment transaction was recorded for another sale or amount",
);
const PAYMENT_NOT_OWNED = cloudError("not_found", "that payment is not this register's");
const INVALID_AMOUNT = cloudError("validation_failed", "amount must be a positive number of cents");

type CloudErrorBody = ReturnType<typeof cloudError>;

function sendError(reply: FastifyReply, error: CloudErrorBody) {
  return reply.code(cloudErrorStatus(error.code)).send(error);
}

function toWire(transaction: ProviderPaymentTransaction): MercadoPagoQrPaymentBody {
  return {
    payment_transaction_id: transaction.id,
    state: transaction.state,
    needs_review: transaction.needsReview,
    amount: transaction.amount,
    expires_at: transaction.expiresAt.toISOString(),
  };
}

// Public to the backoffice's session guard: the device token is these routes' own authentication.
export function registerMercadoPagoQrRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: MercadoPagoQrRoutesOptions<TQueryResult>,
): void {
  const tokenPorts = installationTokenPorts(options);
  const clock = { now: options.now };
  const admission = { admission: new DrizzleRequestAdmission(options.db), clock };
  const lanes = new DrizzlePaymentTransactionLanes(options.connections);

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
      await sendError(reply, REVOKED);
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

    scope.post(
      "/payments/mercado-pago-qr/orders",
      { config: { access: PUBLIC_ACCESS } },
      async (request, reply) => {
        const registerId = await installationRegisterId(request.headers.authorization, reply);
        if (registerId === undefined) {
          return;
        }
        const { mercadoPago } = options;
        if (mercadoPago === undefined) {
          await sendError(reply, PROVIDER_NOT_CONFIGURED);
          return;
        }
        const body = await readValidatedBody(reply, mercadoPagoQrOrderRequestSchema, request.body);
        if (!body) {
          return;
        }

        const outcome = await createMercadoPagoQrOrder(
          { lanes, mercadoPago, clock },
          {
            registerId,
            paymentTransactionId: body.payment_transaction_id,
            saleId: body.sale_id,
            amount: body.amount,
          },
        );

        switch (outcome.kind) {
          case "recorded":
            await reply
              .code(200)
              .send(mercadoPagoQrPaymentSchema.parse(toWire(outcome.transaction)));
            return;
          case "invalid_amount":
            await sendError(reply, INVALID_AMOUNT);
            return;
          case "request_mismatch":
            await sendError(reply, REQUEST_MISMATCH);
            return;
          case "not_owned":
            await sendError(reply, PAYMENT_NOT_OWNED);
            return;
          case "provider_refused":
            await sendError(reply, PROVIDER_REFUSED);
            return;
          case "provider_unavailable":
            await sendError(reply, PROVIDER_UNAVAILABLE);
            return;
        }
      },
    );

    scope.get(
      "/payments/mercado-pago-qr/:id",
      { config: { access: PUBLIC_ACCESS } },
      async (request, reply) => {
        const registerId = await installationRegisterId(request.headers.authorization, reply);
        if (registerId === undefined) {
          return;
        }
        const { mercadoPago } = options;
        if (mercadoPago === undefined) {
          await sendError(reply, PROVIDER_NOT_CONFIGURED);
          return;
        }
        const ids = await readRecordIds(reply, request.params, ["id"]);
        if (!ids) {
          return;
        }

        const outcome = await readMercadoPagoQrPayment(
          { lanes, mercadoPago, clock },
          { registerId, paymentTransactionId: ids.id },
        );

        switch (outcome.kind) {
          case "read":
            await reply
              .code(200)
              .send(mercadoPagoQrPaymentSchema.parse(toWire(outcome.transaction)));
            return;
          case "not_found":
            await sendError(reply, PAYMENT_NOT_OWNED);
            return;
          case "provider_unavailable":
            await sendError(reply, PROVIDER_UNAVAILABLE);
            return;
        }
      },
    );
  });
}
