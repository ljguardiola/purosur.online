import { cloudError, cloudErrorStatus } from "@purosur/contracts";
import {
  admitPaymentNotification,
  confirmMercadoPagoOrderNotification,
  type MercadoPagoOrders,
} from "@purosur/domain/payments/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import type { DedicatedConnections } from "../platform/dedicated-connections.js";
import { reportError } from "../platform/error-reporting.js";
import { sendRateLimited } from "../platform/rate-limited-response.js";
import { resolveSourceAddress } from "../platform/source-address.js";
import { PUBLIC_ACCESS } from "../sessions/route-access.js";
import { DrizzlePaymentNotificationAdmission } from "./drizzle-payment-notification-admission.js";
import { DrizzlePaymentTransactionDirectory } from "./drizzle-payment-transaction-directory.js";
import { DrizzlePaymentTransactionLanes } from "./drizzle-payment-transaction-lanes.js";
import { verifyMercadoPagoNotificationSignature } from "./mercado-pago-notification-signature.js";
import { ReportedNotifications } from "./reported-notifications.js";

export interface MercadoPagoNotificationRoutesOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  now: () => Date;
  connections: DedicatedConnections<TQueryResult>;
  mercadoPago?: MercadoPagoOrders;
  webhookSecret?: string;
  report?: typeof reportError;
}

const ORDER_NOTIFICATION_TYPE = "order";

// Mercado Pago sends a notification again until it is answered 200, and each time it fails alike.
const NOTIFICATIONS_REMEMBERED_AS_REPORTED = 1000;

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

function bodyDataId(body: unknown): string | undefined {
  const data = typeof body === "object" && body !== null ? Reflect.get(body, "data") : undefined;
  const id = typeof data === "object" && data !== null ? Reflect.get(data, "id") : undefined;
  return typeof id === "string" ? id : undefined;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

// Public to the backoffice's session guard. Mercado Pago does not sign the notifications of QR
// orders with the application's secret, so an order notification decides nothing by itself: it
// only makes the cloud read now, with its own credentials, the order of a pending payment of ours.
// Any other notification is authenticated by its signature.
export function registerMercadoPagoNotificationRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: MercadoPagoNotificationRoutesOptions<TQueryResult>,
): void {
  const clock = { now: options.now };
  const admission = { admission: new DrizzlePaymentNotificationAdmission(options.db), clock };
  const directory = new DrizzlePaymentTransactionDirectory(options.db);
  const lanes = new DrizzlePaymentTransactionLanes(options.connections);
  const report = options.report ?? reportError;
  const reported = new ReportedNotifications(NOTIFICATIONS_REMEMBERED_AS_REPORTED);

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

      const admitted = await admitPaymentNotification(admission, {
        sourceAddress: resolveSourceAddress(request),
      });
      if (admitted.kind === "rate_limited") {
        await sendRateLimited(reply, "too many notifications", admitted.retryAfterSeconds);
        return;
      }

      const type = queryValue(request.query, "type");
      const dataId = queryValue(request.query, "data.id");
      if (type === ORDER_NOTIFICATION_TYPE) {
        const outcome =
          dataId === undefined
            ? undefined
            : await confirmMercadoPagoOrderNotification(
                { directory, lanes, mercadoPago, clock },
                { providerOrderId: dataId },
              );
        if (outcome?.kind === "provider_unavailable") {
          if (dataId !== undefined && reported.firstReport(`order:${dataId}`)) {
            report(
              "payments: a Mercado Pago order its notification named could not be read",
              new Error("a Mercado Pago order its notification named could not be read"),
              { context: { providerOrderId: dataId } },
            );
          }
          await reply.code(cloudErrorStatus(PROVIDER_UNAVAILABLE.code)).send(PROVIDER_UNAVAILABLE);
          return;
        }
        await reply.code(200).send();
        return;
      }

      const requestId = headerValue(request.headers["x-request-id"]);
      const signature = verifyMercadoPagoNotificationSignature({
        secret: webhookSecret,
        signatureHeader: headerValue(request.headers["x-signature"]),
        requestId,
        dataId,
      });
      if (signature.kind === "refused") {
        const sentInBody = bodyDataId(request.body);
        console.warn(
          "discarded a Mercado Pago notification with an invalid signature",
          signature.reason === "mismatch"
            ? {
                reason: signature.reason,
                type,
                dataId,
                dataIdSource: "query",
                ...(sentInBody !== dataId ? { bodyDataId: sentInBody } : {}),
                ts: signature.ts,
                requestId,
                manifests: signature.manifests,
              }
            : { reason: signature.reason, type },
        );
        if (reported.firstReport(JSON.stringify(["refused", type, dataId]))) {
          report(
            "payments: discarded a Mercado Pago notification with an invalid signature",
            new Error("discarded a Mercado Pago notification with an invalid signature"),
            { context: { reason: signature.reason, ...(type !== undefined && { type }) } },
          );
        }
        await reply.code(401).send();
        return;
      }
      await reply.code(200).send();
    },
  );
}
