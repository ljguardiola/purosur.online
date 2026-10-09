import { cloudError, cloudErrorStatus } from "@purosur/contracts";
import {
  admitPaymentNotification,
  confirmMercadoPagoOrderNotification,
  type MercadoPagoOrders,
} from "@purosur/domain/payments/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import type { DedicatedConnections } from "../platform/dedicated-connections.js";
import { sendRateLimited } from "../platform/rate-limited-response.js";
import { resolveSourceAddress } from "../platform/source-address.js";
import { PUBLIC_ACCESS } from "../sessions/route-access.js";
import { DrizzlePaymentNotificationAdmission } from "./drizzle-payment-notification-admission.js";
import { DrizzlePaymentTransactionDirectory } from "./drizzle-payment-transaction-directory.js";
import { DrizzlePaymentTransactionLanes } from "./drizzle-payment-transaction-lanes.js";
import { verifyMercadoPagoNotificationSignature } from "./mercado-pago-notification-signature.js";

export interface MercadoPagoNotificationRoutesOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  now: () => Date;
  connections: DedicatedConnections<TQueryResult>;
  mercadoPago?: MercadoPagoOrders;
  webhookSecret?: string;
}

const ORDER_NOTIFICATION_TYPE = "order";

const PROVIDER_NOT_CONFIGURED = cloudError(
  "payment_provider_not_configured",
  "the payment provider is not configured",
);
const PROVIDER_UNAVAILABLE = cloudError(
  "payment_provider_unavailable",
  "the payment provider could not be reached",
);

function queryValue(query: unknown, name: string): string | undefined {
  const value = typeof query === "object" && query !== null ? Reflect.get(query, name) : undefined;
  return typeof value === "string" ? value : undefined;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

// Public to the backoffice's session guard: the notification's signature is this route's own
// authentication. The signature covers the order's id and not the body, so the body is never read.
export function registerMercadoPagoNotificationRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: MercadoPagoNotificationRoutesOptions<TQueryResult>,
): void {
  const clock = { now: options.now };
  const admission = { admission: new DrizzlePaymentNotificationAdmission(options.db), clock };
  const directory = new DrizzlePaymentTransactionDirectory(options.db);
  const lanes = new DrizzlePaymentTransactionLanes(options.connections);

  app.post(
    "/payments/mercado-pago/notifications",
    { config: { access: PUBLIC_ACCESS } },
    async (request, reply) => {
      const { mercadoPago, webhookSecret } = options;
      if (mercadoPago === undefined || webhookSecret === undefined) {
        await reply
          .code(cloudErrorStatus(PROVIDER_NOT_CONFIGURED.code))
          .send(PROVIDER_NOT_CONFIGURED);
        return;
      }

      const dataId = queryValue(request.query, "data.id");
      const signed = verifyMercadoPagoNotificationSignature({
        secret: webhookSecret,
        signatureHeader: headerValue(request.headers["x-signature"]),
        requestId: headerValue(request.headers["x-request-id"]),
        dataId,
      });
      const admitted = await admitPaymentNotification(admission, {
        sourceAddress: resolveSourceAddress(request),
      });
      if (admitted.kind === "rate_limited") {
        await sendRateLimited(reply, "too many notifications", admitted.retryAfterSeconds);
        return;
      }

      if (!signed || dataId === undefined) {
        console.warn("discarded a Mercado Pago notification with an invalid signature");
        await reply.code(401).send();
        return;
      }

      if (queryValue(request.query, "type") !== ORDER_NOTIFICATION_TYPE) {
        await reply.code(200).send();
        return;
      }

      const outcome = await confirmMercadoPagoOrderNotification(
        { directory, lanes, mercadoPago, clock },
        { providerOrderId: dataId },
      );
      if (outcome.kind === "provider_unavailable") {
        await reply.code(cloudErrorStatus(PROVIDER_UNAVAILABLE.code)).send(PROVIDER_UNAVAILABLE);
        return;
      }
      await reply.code(200).send();
    },
  );
}
