import { type InternalBarcodeGenerationBody, internalBarcodeSchema } from "@purosur/contracts";
import { rateLimitOutcome } from "./rate-limit-outcome";

export type GenerateInternalBarcodeOutcome =
  | { kind: "ok"; code: string }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function generateInternalBarcode(
  body: InternalBarcodeGenerationBody,
): Promise<GenerateInternalBarcodeOutcome> {
  return requestInternalBarcode("/api/internal-barcodes", body);
}

export async function requestInternalBarcode(
  path: string,
  body: InternalBarcodeGenerationBody,
): Promise<GenerateInternalBarcodeOutcome> {
  let response: Response;
  try {
    response = await postJson(path, body);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = internalBarcodeSchema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) {
      return { kind: "failed" };
    }
    return { kind: "ok", code: parsed.data.code };
  }
  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (response.status === 403) {
    return { kind: "forbidden" };
  }
  if (response.status === 429) {
    return rateLimitOutcome(response);
  }
  return { kind: "failed" };
}
