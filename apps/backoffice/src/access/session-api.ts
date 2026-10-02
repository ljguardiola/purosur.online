import {
  openSessionSchema,
  type SessionAuthenticationBody,
  sessionAuthenticationOptionsSchema,
  sessionStatusSchema,
} from "@purosur/contracts";
import type { Capability, ManualStockMovementKind } from "@purosur/domain";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { retryAfterSeconds } from "../platform/retry-after-seconds";

// The sign-in lockout blocks for a fixed 15 minutes once tripped, unlike the rolling one-hour
// window other rate limits use.
const LOCKOUT_FALLBACK_SECONDS = 15 * 60;

export type SessionOutcome =
  | {
      kind: "ok";
      userId: string;
      displayName: string;
      isAdministrator: boolean;
      expiresAt: string;
      capabilities: Capability[];
      stockMovementKinds: ManualStockMovementKind[];
    }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type SessionStatusOutcome =
  | { kind: "ok"; expiresAt: string }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type AuthenticationOptionsOutcome =
  | { kind: "ok"; value: PublicKeyCredentialRequestOptionsJSON }
  | { kind: "failed" };

export type AuthenticateOutcome =
  | { kind: "ok" }
  | { kind: "unknown_passkey" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type SignOutOutcome =
  | { kind: "ok" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

function postJson(path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

export async function fetchSession(): Promise<SessionOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/sessions/current");
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (response.status === 429) {
    return {
      kind: "rate_limited",
      retryAfterSeconds: retryAfterSeconds(response),
    };
  }
  if (!response.ok) {
    return { kind: "failed" };
  }
  const body = openSessionSchema.safeParse(await response.json().catch(() => undefined));
  if (!body.success) {
    return { kind: "failed" };
  }
  return {
    kind: "ok",
    userId: body.data.user_id,
    displayName: body.data.display_name,
    isAdministrator: body.data.is_administrator,
    expiresAt: body.data.expires_at,
    capabilities: body.data.capabilities,
    stockMovementKinds: body.data.stock_movement_kinds,
  };
}

// Unlike `fetchSession`, doesn't touch `last_seen_at`, so a probing tab can't keep an idle session alive.
export async function checkSessionStatus(): Promise<SessionStatusOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/sessions/current/expiration");
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (response.status === 429) {
    return {
      kind: "rate_limited",
      retryAfterSeconds: retryAfterSeconds(response),
    };
  }
  if (!response.ok) {
    return { kind: "failed" };
  }
  const body = sessionStatusSchema.safeParse(await response.json().catch(() => undefined));
  if (!body.success) {
    return { kind: "failed" };
  }
  return { kind: "ok", expiresAt: body.data.expires_at };
}

export async function fetchAuthenticationOptions(): Promise<AuthenticationOptionsOutcome> {
  let response: Response;
  try {
    response = await postJson("/api/authentication-challenges");
  } catch {
    return { kind: "failed" };
  }
  if (!response.ok) {
    return { kind: "failed" };
  }
  const body = sessionAuthenticationOptionsSchema.safeParse(
    await response.json().catch(() => undefined),
  );
  if (!body.success) {
    return { kind: "failed" };
  }
  return { kind: "ok", value: body.data.passkey_authentication_options };
}

// The cloud only distinguishes an unrecognized credential id (`unknown_passkey`) from every other rejection.
export async function authenticate(
  assertion: AuthenticationResponseJSON,
): Promise<AuthenticateOutcome> {
  const requestBody: SessionAuthenticationBody = { assertion };
  let response: Response;
  try {
    response = await postJson("/api/sessions", requestBody);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    return { kind: "ok" };
  }
  if (response.status === 429) {
    return {
      kind: "rate_limited",
      retryAfterSeconds: retryAfterSeconds(response, LOCKOUT_FALLBACK_SECONDS),
    };
  }
  if (response.status === 401) {
    const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
    if (body?.code === "unknown_passkey") {
      return { kind: "unknown_passkey" };
    }
  }
  return { kind: "failed" };
}

export async function signOut(): Promise<SignOutOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/sessions/current", { method: "DELETE" });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok || response.status === 401) {
    return { kind: "ok" };
  }
  if (response.status === 429) {
    return {
      kind: "rate_limited",
      retryAfterSeconds: retryAfterSeconds(response),
    };
  }
  return { kind: "failed" };
}
