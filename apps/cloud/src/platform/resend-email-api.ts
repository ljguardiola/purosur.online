export interface ResendApiOptions {
  apiKey: string;
  fetch?: typeof globalThis.fetch;
}

const RESEND_API_URL = "https://api.resend.com/emails";

export class ResendRefusalError extends Error {}
// The worker runs two jobs at a time, so a Resend request that never answers would hold one of
// those two slots and delay every other email.
const RESEND_TIMEOUT_MS = 10_000;

// fetch resolves on any HTTP status, but callers retry or roll back only on a rejected send, so a
// non-2xx response rejects.
export async function postResendEmail(
  options: ResendApiOptions,
  message: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<string> {
  const doFetch = options.fetch ?? globalThis.fetch;
  const abort = new AbortController();
  const timeout = setTimeout(
    () => abort.abort(new Error(`Resend API did not answer within ${RESEND_TIMEOUT_MS} ms`)),
    RESEND_TIMEOUT_MS,
  );
  try {
    const response = await doFetch(RESEND_API_URL, {
      method: "POST",
      signal: abort.signal,
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(message),
    });
    const responseBody = await response.text();
    if (!response.ok) {
      throw new ResendRefusalError(`Resend API responded ${response.status}: ${responseBody}`);
    }
    return responseBody;
  } finally {
    clearTimeout(timeout);
  }
}
