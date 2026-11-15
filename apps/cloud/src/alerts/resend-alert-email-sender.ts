import type { AlertEmailSender } from "@purosur/domain/alerts/use-cases";
import { postResendEmail, ResendRefusalError } from "../platform/resend-email-api.js";
import { alertEmailContent } from "./alert-email-content.js";

export interface ResendAlertEmailSenderOptions {
  apiKey: string;
  emailFrom: string;
  replyTo: string;
  backofficeOrigin: string;
  fetch?: typeof globalThis.fetch;
  warn?: (message: string) => void;
}

export const ALERT_EMAIL_DELIVERY_TAG = "alert_email_delivery";

const ALERT_SENDER_NAME = "Puro Sur Alertas";
const ALERT_SENDER_LOCAL_PART = "alertas";

export function alertSenderOf(emailFrom: string): string {
  const address = /<([^<>]+)>/.exec(emailFrom)?.[1] ?? emailFrom;
  const domain = address.split("@")[1]?.trim();
  if (!domain) {
    throw new Error("the recovery email sender has no address to take the alerts' domain from");
  }
  return `${ALERT_SENDER_NAME} <${ALERT_SENDER_LOCAL_PART}@${domain}>`;
}

function providerMessageIdOf(responseBody: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(responseBody);
    const id =
      typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "id") : undefined;
    return typeof id === "string" && id !== "" ? id : undefined;
  } catch {
    return undefined;
  }
}

export function createResendAlertEmailSender(
  options: ResendAlertEmailSenderOptions,
): AlertEmailSender {
  const from = alertSenderOf(options.emailFrom);
  const warn = options.warn ?? console.warn;
  return {
    async sendAlertEmail(email) {
      const logFailure = (providerError: string) => {
        warn(
          `Alert email not sent (alert ${email.alertId}, delivery ${email.deliveryId}, stage ${email.stage}): ${providerError}`,
        );
      };
      const content = alertEmailContent(email, options.backofficeOrigin);
      try {
        const responseBody = await postResendEmail(
          options,
          {
            from,
            to: [email.to],
            reply_to: options.replyTo,
            subject: content.subject,
            text: content.text,
            html: content.html,
            tags: [{ name: ALERT_EMAIL_DELIVERY_TAG, value: email.deliveryId }],
          },
          { "Idempotency-Key": `alert-email/${email.deliveryId}` },
        );
        const providerMessageId = providerMessageIdOf(responseBody);
        if (providerMessageId === undefined) {
          logFailure("Resend API accepted the email without a message id");
          return { kind: "failed", reason: "provider_unconfirmed" };
        }
        return { kind: "sent", providerMessageId };
      } catch (error) {
        logFailure(error instanceof Error ? error.message : String(error));
        return {
          kind: "failed",
          reason: error instanceof ResendRefusalError ? "provider_refused" : "provider_unreachable",
        };
      }
    },
  };
}
