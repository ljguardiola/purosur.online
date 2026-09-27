import type { RecoveryEmailSender } from "./recovery-email-sender.js";

export interface ResendRecoveryEmailSenderOptions {
  apiKey: string;
  from: string;
  replyTo: string;
  fetch?: typeof globalThis.fetch;
}

const RESEND_API_URL = "https://api.resend.com/emails";

function buildEmailBody(link: string): { text: string; html: string } {
  const intro = "Se pidió recuperar el acceso a tu cuenta de Puro Sur.";
  const action = "Usá este enlace para registrar una passkey nueva:";
  const validity = "Vale 15 minutos y se usa una sola vez.";
  const ignore = "Si no lo pediste, podés ignorar este mensaje.";
  const text = [intro, "", action, link, "", validity, ignore].join("\n");
  const html = `<p>${intro}</p><p>${action}</p><p><a href="${link}">${link}</a></p><p>${validity}</p><p>${ignore}</p>`;
  return { text, html };
}

/** Rejects on a non-2xx response, so graphile-worker's own retries apply to a failed send. */
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
          subject: "Recuperar el acceso a Puro Sur",
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
