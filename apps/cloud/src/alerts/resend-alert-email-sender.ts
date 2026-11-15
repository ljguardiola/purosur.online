import type { AlertEmailSender } from "@purosur/domain/alerts/use-cases";
import { postResendEmail } from "../platform/resend-email-api.js";
import { alertEmailContent } from "./alert-email-content.js";

export interface ResendAlertEmailSenderOptions {
  apiKey: string;
  emailFrom: string;
  replyTo: string;
  backofficeOrigin: string;
  fetch?: typeof globalThis.fetch;
}

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
  return {
    async sendAlertEmail(email) {
      try {
        const content = alertEmailContent(email, options.backofficeOrigin);
        const responseBody = await postResendEmail(
          options,
          {
            from,
            to: [email.to],
            reply_to: options.replyTo,
            subject: content.subject,
            text: content.text,
            html: content.html,
          },
          { "Idempotency-Key": `alert-email/${email.deliveryId}` },
        );
        const providerMessageId = providerMessageIdOf(responseBody);
        return providerMessageId === undefined
          ? { kind: "failed", error: "Resend API accepted the email without a message id" }
          : { kind: "sent", providerMessageId };
      } catch (error) {
        return { kind: "failed", error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}
