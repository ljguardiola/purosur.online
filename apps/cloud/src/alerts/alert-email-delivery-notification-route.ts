import {
  alertEmailDeliveryNotificationSchema,
  cloudError,
  cloudErrorStatus,
} from "@purosur/contracts";
import {
  type AlertEmailStatusQuery,
  applyQueriedAlertEmailStatus,
} from "@purosur/domain/alerts/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { reportError } from "../platform/error-reporting.js";
import { ReportedNotifications } from "../platform/reported-notifications.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { PUBLIC_ACCESS } from "../sessions/route-access.js";
import { DrizzleAlertEmailStatusStore } from "./drizzle-alert-email-status-store.js";
import { verifyResendWebhookSignature } from "./resend-webhook-signature.js";

export interface AlertEmailDeliveryNotificationRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  now: () => Date;
  statusQuery?: AlertEmailStatusQuery;
  webhookSecret?: string;
  report?: typeof reportError;
}

const REFUSALS_REMEMBERED_AS_REPORTED = 100;

const PROVIDER_NOT_CONFIGURED = cloudError(
  "alert_email_provider_not_configured",
  "the alert email provider is not configured",
);
const PROVIDER_UNAVAILABLE = cloudError(
  "alert_email_provider_unavailable",
  "the alert email provider could not be reached",
);
const SEND_NOT_YET_RECORDED = cloudError(
  "alert_email_send_not_yet_recorded",
  "the alert email's sending is not recorded yet",
);

function headerValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parsedJson(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody);
  } catch {
    return undefined;
  }
}

export function registerAlertEmailDeliveryNotificationRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: AlertEmailDeliveryNotificationRouteOptions<TQueryResult>,
): void {
  const store = new DrizzleAlertEmailStatusStore(options.db);
  const report = options.report ?? reportError;
  const reported = new ReportedNotifications(REFUSALS_REMEMBERED_AS_REPORTED);

  app.register(async (scope) => {
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser(
      "application/json",
      { parseAs: "string" },
      (_request, body, done) => {
        done(null, body);
      },
    );

    scope.post(
      "/alerts/email-deliveries/notifications",
      { config: { access: PUBLIC_ACCESS } },
      async (request, reply) => {
        const { statusQuery, webhookSecret } = options;
        if (statusQuery === undefined || webhookSecret === undefined) {
          await reply
            .code(cloudErrorStatus(PROVIDER_NOT_CONFIGURED.code))
            .send(PROVIDER_NOT_CONFIGURED);
          return;
        }

        const rawBody = typeof request.body === "string" ? request.body : "";
        const signature = verifyResendWebhookSignature({
          secret: webhookSecret,
          rawBody,
          id: headerValue(request.headers["svix-id"]),
          timestamp: headerValue(request.headers["svix-timestamp"]),
          signature: headerValue(request.headers["svix-signature"]),
          now: options.now(),
        });
        if (signature.kind === "refused") {
          console.warn("discarded an alert email delivery notification with an invalid signature", {
            reason: signature.reason,
          });
          if (reported.firstReport(signature.reason)) {
            report(
              "alerts: discarded an alert email delivery notification with an invalid signature",
              new Error("discarded an alert email delivery notification with an invalid signature"),
              { context: { reason: signature.reason } },
            );
          }
          await reply.code(401).send();
          return;
        }

        const notification = await readValidatedBody(
          reply,
          alertEmailDeliveryNotificationSchema,
          parsedJson(rawBody),
        );
        if (notification === undefined) {
          return;
        }
        if (!("data" in notification)) {
          await reply.code(200).send();
          return;
        }
        const outcome = await applyQueriedAlertEmailStatus(
          { store, statusQuery },
          { providerMessageId: notification.data.email_id },
        );
        if (outcome.kind === "provider_unavailable") {
          await reply.code(cloudErrorStatus(PROVIDER_UNAVAILABLE.code)).send(PROVIDER_UNAVAILABLE);
          return;
        }
        if (outcome.kind === "send_not_yet_recorded") {
          await reply
            .code(cloudErrorStatus(SEND_NOT_YET_RECORDED.code))
            .send(SEND_NOT_YET_RECORDED);
          return;
        }
        await reply.code(200).send();
      },
    );
  });
}
