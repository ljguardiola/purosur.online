import {
  cloudError,
  cloudErrorStatus,
  type MercadoPagoCancellationBody,
  type MercadoPagoPaymentBody,
  mercadoPagoCancellationRequestSchema,
  mercadoPagoCancellationSchema,
  mercadoPagoOrderRequestSchema,
  mercadoPagoPaymentSchema,
} from "@purosur/contracts";
import type { MercadoPagoOrderTransaction } from "@purosur/domain";
import {
  cancelMercadoPagoOrder,
  createMercadoPagoPointOrder,
  createMercadoPagoQrOrder,
  type MercadoPagoOrders,
  readMercadoPagoOrderPayment,
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
import { DrizzlePointTerminals } from "./drizzle-point-terminals.js";
import { DrizzleQrPointsOfSale } from "./drizzle-qr-points-of-sale.js";
import { randomMercadoPagoCancellationKeys } from "./mercado-pago-cancellation-keys.js";

export type MercadoPagoOrderRoutesOptions<TQueryResult extends PgQueryResultHKT> =
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
const BELOW_MINIMUM = cloudError(
  "validation_failed",
  "amount is below the minimum the integrated terminal charges",
);

type CloudErrorBody = ReturnType<typeof cloudError>;

function sendError(reply: FastifyReply, error: CloudErrorBody) {
  return reply.code(cloudErrorStatus(error.code)).send(error);
}

function toWire(transaction: MercadoPagoOrderTransaction): MercadoPagoPaymentBody {
  return {
    payment_transaction_id: transaction.id,
    state: transaction.state,
    needs_review: transaction.needsReview,
    provider: transaction.provider,
    amount: transaction.amount,
    expires_at: transaction.expiresAt.toISOString(),
  };
}

function toCancellationWire(
  transaction: MercadoPagoOrderTransaction,
  cancelOnTerminal: boolean,
): MercadoPagoCancellationBody {
  return { ...toWire(transaction), cancel_on_terminal: cancelOnTerminal };
}

// Public to the backoffice's session guard: the device token is these routes' own authentication.
export function registerMercadoPagoOrderRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: MercadoPagoOrderRoutesOptions<TQueryResult>,
): void {
  const tokenPorts = installationTokenPorts(options);
  const clock = { now: options.now };
  const admission = { admission: new DrizzleRequestAdmission(options.db), clock };
  const lanes = new DrizzlePaymentTransactionLanes(options.connections);
  const pointTerminals = new DrizzlePointTerminals(options.db);
  const qrPointsOfSale = new DrizzleQrPointsOfSale(options.db);

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
      "/payments/mercado-pago/orders",
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
        const body = await readValidatedBody(reply, mercadoPagoOrderRequestSchema, request.body);
        if (!body) {
          return;
        }
        const input = {
          registerId,
          paymentTransactionId: body.payment_transaction_id,
          saleId: body.sale_id,
          amount: body.amount,
        };
        const outcome =
          body.provider === "MERCADOPAGO_POINT"
            ? await createMercadoPagoPointOrder(
                { lanes, mercadoPago, pointTerminals, clock },
                input,
              )
            : await createMercadoPagoQrOrder({ lanes, mercadoPago, qrPointsOfSale, clock }, input);

        switch (outcome.kind) {
          case "recorded":
            await reply.code(200).send(mercadoPagoPaymentSchema.parse(toWire(outcome.transaction)));
            return;
          case "invalid_amount":
            await sendError(reply, INVALID_AMOUNT);
            return;
          case "below_minimum":
            await sendError(reply, BELOW_MINIMUM);
            return;
          case "request_mismatch":
            await sendError(reply, REQUEST_MISMATCH);
            return;
          case "not_owned":
            await sendError(reply, PAYMENT_NOT_OWNED);
            return;
          case "not_configured":
            await sendError(reply, PROVIDER_NOT_CONFIGURED);
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
      "/payments/mercado-pago/:id",
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

        const outcome = await readMercadoPagoOrderPayment(
          { lanes, mercadoPago, clock },
          { registerId, paymentTransactionId: ids.id },
        );

        switch (outcome.kind) {
          case "read":
            await reply.code(200).send(mercadoPagoPaymentSchema.parse(toWire(outcome.transaction)));
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

    scope.post(
      "/payments/mercado-pago/:id/cancel",
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
        const body = await readValidatedBody(
          reply,
          mercadoPagoCancellationRequestSchema,
          request.body,
        );
        if (!body) {
          return;
        }

        const outcome = await cancelMercadoPagoOrder(
          { lanes, mercadoPago, cancellationKeys: randomMercadoPagoCancellationKeys, clock },
          {
            registerId,
            paymentTransactionId: ids.id,
            saleId: body.sale_id,
            amount: body.amount,
            provider: body.provider,
          },
        );

        switch (outcome.kind) {
          case "cancelled":
          case "approved":
          case "already_closed":
            await reply
              .code(200)
              .send(
                mercadoPagoCancellationSchema.parse(toCancellationWire(outcome.transaction, false)),
              );
            return;
          case "cancel_on_terminal":
            await reply
              .code(200)
              .send(
                mercadoPagoCancellationSchema.parse(toCancellationWire(outcome.transaction, true)),
              );
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
