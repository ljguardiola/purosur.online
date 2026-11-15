import type { AlertEmailSender } from "@purosur/domain/alerts/use-cases";
import { alertEmailContent } from "./alert-email-content.js";

export function createLogAlertEmailSender(options: { backofficeOrigin: string }): AlertEmailSender {
  return {
    async sendAlertEmail(email) {
      const { subject } = alertEmailContent(email, options.backofficeOrigin);
      console.log(
        `alert email for ${email.to}: ${subject} (${options.backofficeOrigin}/?alert=${email.alertId})`,
      );
      return { kind: "sent", providerMessageId: `log:${email.deliveryId}` };
    },
  };
}
