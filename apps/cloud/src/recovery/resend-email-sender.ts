import { recoveryEmailMessages } from "./recovery-email-messages.js";
import type { RecoveryEmailSender } from "./recovery-email-sender.js";

export interface ResendRecoveryEmailSenderOptions {
  apiKey: string;
  from: string;
  replyTo: string;
  /** Injected in tests so sending an email never reaches the network. */
  fetch?: typeof globalThis.fetch;
}

const RESEND_API_URL = "https://api.resend.com/emails";

function buildEmailBody(link: string): { text: string; html: string } {
  const m = recoveryEmailMessages;
  const text = [m.intro, "", m.action, link, "", m.validity, m.ignore].join("\n");
  const html = `<p>${m.intro}</p><p>${m.action}</p><p><a href="${link}">${link}</a></p><p>${m.validity}</p><p>${m.ignore}</p>`;
  return { text, html };
}

/**
 * A Resend HTTP API adapter behind the `RecoveryEmailSender` port. Rejects on a non-2xx response
 * so graphile-worker's own retries apply to a failed send, the same as any other task failure.
 */
export function createResendRecoveryEmailSender(
  options: ResendRecoveryEmailSenderOptions,
): RecoveryEmailSender {
  const doFetch = options.fetch ?? globalThis.fetch;

  return {
    async sendRecoveryLink(input) {
      const { text, html } = buildEmailBody(input.link);

      const response = await doFetch(RESEND_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: options.from,
          to: [input.to],
          reply_to: options.replyTo,
          subject: recoveryEmailMessages.subject,
          text,
          html,
        }),
      });

      if (!response.ok) {
        const responseBody = await response.text();
        throw new Error(`Resend API responded ${response.status}: ${responseBody}`);
      }
    },
  };
}
