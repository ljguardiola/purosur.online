import type { AccessEmailSender } from "./recovery-email-sender.js";

export interface ResendRecoveryEmailSenderOptions {
  apiKey: string;
  from: string;
  replyTo: string;
  fetch?: typeof globalThis.fetch;
}

const RESEND_API_URL = "https://api.resend.com/emails";
// The worker runs two jobs at a time, so a Resend request that never answers would hold one of
// those two slots and delay every other email.
const RESEND_TIMEOUT_MS = 10_000;

function buildEmailBody(link: string): { text: string; html: string } {
  const intro = "Se pidió recuperar el acceso a tu cuenta de Puro Sur.";
  const action = "Usá este enlace para registrar una passkey nueva:";
  const validity = "Vale 15 minutos y se usa una sola vez.";
  const ignore = "Si no lo pediste, podés ignorar este mensaje.";
  const text = [intro, "", action, link, "", validity, ignore].join("\n");
  const html = `<p>${intro}</p><p>${action}</p><p><a href="${link}">${link}</a></p><p>${validity}</p><p>${ignore}</p>`;
  return { text, html };
}

function buildFirstPinCodeEmailBody(code: string): { text: string; html: string } {
  const grouped = code.match(/.{1,4}/g)?.join(" ") ?? code;
  const intro = "Se pidió crear el PIN de tu cuenta de Puro Sur.";
  const action = "Ingresá este código en la caja para crear tu PIN:";
  const validity = "Vale 15 minutos y se usa una sola vez.";
  const ignore = "Si no lo pediste, podés ignorar este mensaje.";
  const text = [intro, "", action, grouped, "", validity, ignore].join("\n");
  const html = `<p>${intro}</p><p>${action}</p><p><strong>${grouped}</strong></p><p>${validity}</p><p>${ignore}</p>`;
  return { text, html };
}

// fetch resolves on any HTTP status, but callers retry or roll back only on a rejected send, so a
// non-2xx response rejects.
export function createResendRecoveryEmailSender(
  options: ResendRecoveryEmailSenderOptions,
): AccessEmailSender {
  const doFetch = options.fetch ?? globalThis.fetch;

  async function send(to: string, subject: string, body: { text: string; html: string }) {
    const abort = new AbortController();
    const timeout = setTimeout(
      () => abort.abort(new Error(`Resend API did not answer within ${RESEND_TIMEOUT_MS} ms`)),
      RESEND_TIMEOUT_MS,
    );
    try {
      await post(to, subject, body, abort.signal);
    } finally {
      clearTimeout(timeout);
    }
  }

  async function post(
    to: string,
    subject: string,
    body: { text: string; html: string },
    signal: AbortSignal,
  ) {
    const response = await doFetch(RESEND_API_URL, {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: options.from,
        to: [to],
        reply_to: options.replyTo,
        subject,
        text: body.text,
        html: body.html,
      }),
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(`Resend API responded ${response.status}: ${responseBody}`);
    }
  }

  return {
    sendRecoveryLink: (input) =>
      send(input.to, "Recuperar el acceso a Puro Sur", buildEmailBody(input.link)),
    sendFirstPinCode: (input) =>
      send(input.to, "Tu código para crear el PIN", buildFirstPinCodeEmailBody(input.code)),
  };
}
