import { userPinCodeSchema } from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";
import { type Passkey, passkeyListFromWire } from "./passkey-list";

export type FetchUserPasskeysOutcome = CloudReadOutcome<Passkey[]> | { kind: "not_found" };

export type RemoveUserPasskeyOutcome =
  | { kind: "ok" }
  | { kind: "not_found" }
  | { kind: "own_account" }
  | { kind: "authorization_required" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type EmitUserPinCodeOutcome =
  | { kind: "ok"; value: { code: string; expiresAt: string } }
  | { kind: "not_found" }
  | { kind: "inactive" }
  | { kind: "authorization_required" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

type GatedActionErrorOutcome =
  | { kind: "unauthenticated" }
  | { kind: "authorization_required" }
  | { kind: "forbidden" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

// Gated by the shared passkey-authorization window instead of a per-action step-up, so a 401
// here means either the session ended or that window has lapsed, never a rejected assertion.
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

async function forbiddenOrOwnAccount(
  response: Response,
): Promise<{ kind: "forbidden" } | { kind: "own_account" }> {
  const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
  return body?.code === "own_account" ? { kind: "own_account" } : { kind: "forbidden" };
}

// Oldest first.
export async function fetchUserPasskeys(id: string): Promise<FetchUserPasskeysOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/users/${id}/passkeys`);
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (response.status === 403) {
    return { kind: "forbidden" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 429) {
    return rateLimitOutcome(response);
  }
  if (!response.ok) {
    return { kind: "failed" };
  }
  const passkeys = passkeyListFromWire(await response.json().catch(() => undefined));
  if (!passkeys) {
    return { kind: "failed" };
  }
  return { kind: "ok", value: passkeys };
}

// Authorization runs against the Administrator's own passkeys, never the target's.
export async function removeUserPasskey(
  id: string,
  passkeyId: string,
): Promise<RemoveUserPasskeyOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/users/${id}/passkeys/${passkeyId}`, { method: "DELETE" });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    return { kind: "ok" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 403) {
    return forbiddenOrOwnAccount(response);
  }
  return gatedActionErrorOutcome(response);
}

export async function emitUserPinCode(id: string): Promise<EmitUserPinCodeOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/users/${id}/pin-codes`, { method: "POST" });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = userPinCodeSchema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) {
      return { kind: "failed" };
    }
    return { kind: "ok", value: { code: parsed.data.code, expiresAt: parsed.data.expires_at } };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 409) {
    const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
    return body?.code === "user_inactive" ? { kind: "inactive" } : { kind: "failed" };
  }
  return gatedActionErrorOutcome(response);
}
