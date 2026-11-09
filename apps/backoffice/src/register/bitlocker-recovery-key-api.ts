import { type BitlockerRecoveryKeyLoadBody, bitlockerRecoveryKeySchema } from "@purosur/contracts";
import { cloudFetch } from "../platform/cloud-fetch";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";

export type LoadBitlockerRecoveryKeyOutcome =
  | { kind: "ok" }
  | { kind: "not_found" }
  | { kind: "no_current_installation" }
  | { kind: "already_loaded" }
  | GatedActionErrorOutcome;

export type ConsultBitlockerRecoveryKeyOutcome =
  | { kind: "ok"; value: { recoveryKey: string; keyIdentifier: string } }
  | { kind: "not_found" }
  | { kind: "no_current_installation" }
  | { kind: "not_loaded" }
  | GatedActionErrorOutcome;

type GatedActionErrorOutcome =
  | { kind: "unauthenticated" }
  | { kind: "authorization_required" }
  | { kind: "forbidden" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

async function gatedActionErrorOutcome(response: Response): Promise<GatedActionErrorOutcome> {
  if (response.status === 401) {
    const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
    return body?.code === "authorization_required"
      ? { kind: "authorization_required" }
      : { kind: "unauthenticated" };
  }
  if (response.status === 403) {
    return { kind: "forbidden" };
  }
  if (response.status === 429) {
    return rateLimitOutcome(response);
  }
  return { kind: "failed" };
}

function postJson(path: string, body?: unknown): Promise<Response> {
  return cloudFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

async function conflictCode(response: Response): Promise<string | undefined> {
  const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
  return body?.code;
}

export async function loadBitlockerRecoveryKey(
  id: string,
  body: BitlockerRecoveryKeyLoadBody,
): Promise<LoadBitlockerRecoveryKeyOutcome> {
  let response: Response;
  try {
    response = await postJson(`/api/registers/${id}/bitlocker-recovery-key`, body);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    return { kind: "ok" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 409) {
    const code = await conflictCode(response);
    return code === "no_current_installation" || code === "already_loaded"
      ? { kind: code }
      : { kind: "failed" };
  }
  return gatedActionErrorOutcome(response);
}

export async function consultBitlockerRecoveryKey(
  id: string,
): Promise<ConsultBitlockerRecoveryKeyOutcome> {
  let response: Response;
  try {
    response = await postJson(`/api/registers/${id}/bitlocker-recovery-key/consultations`);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = bitlockerRecoveryKeySchema.safeParse(
      await response.json().catch(() => undefined),
    );
    return parsed.success
      ? {
          kind: "ok",
          value: {
            recoveryKey: parsed.data.recovery_key,
            keyIdentifier: parsed.data.key_identifier,
          },
        }
      : { kind: "failed" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 409) {
    const code = await conflictCode(response);
    return code === "no_current_installation" || code === "not_loaded"
      ? { kind: code }
      : { kind: "failed" };
  }
  return gatedActionErrorOutcome(response);
}
