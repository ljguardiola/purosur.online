import { cloudError, cloudErrorStatus } from "@purosur/contracts";
import {
  type AlertEmailStatusQuery,
  applyQueriedAlertEmailStatus,
} from "@purosur/domain/alerts/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { ReportedNotifications } from "../payments/reported-notifications.js";
import { reportError } from "../platform/error-reporting.js";
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
const EMAIL_EVENT_PREFIX = "email.";

const PROVIDER_NOT_CONFIGURED = cloudError(
  "alert_email_provider_not_configured",
  "the alert email provider is not configured",
);
const PROVIDER_UNAVAILABLE = cloudError(
  "alert_email_provider_unavailable",
  "the alert email provider could not be reached",
);

function headerValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function notifiedEmailId(rawBody: string): string | undefined {
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return undefined;
  }
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const type = Reflect.get(body, "type");
  const data = Reflect.get(body, "data");
  const emailId =
    typeof data === "object" && data !== null ? Reflect.get(data, "email_id") : undefined;
  return typeof type === "string" &&
    type.startsWith(EMAIL_EVENT_PREFIX) &&
    typeof emailId === "string"
    ? emailId
    : undefined;
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

        const providerMessageId = notifiedEmailId(rawBody);
        if (providerMessageId === undefined) {
          await reply.code(200).send();
          return;
        }
        const outcome = await applyQueriedAlertEmailStatus(
          { store, statusQuery },
          { providerMessageId },
        );
        if (outcome.kind === "provider_unavailable") {
          await reply.code(cloudErrorStatus(PROVIDER_UNAVAILABLE.code)).send(PROVIDER_UNAVAILABLE);
          return;
        }
        await reply.code(200).send();
      },
    );
  });
}
