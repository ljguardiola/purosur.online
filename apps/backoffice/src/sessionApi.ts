import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";

// The sign-in lockout blocks for a fixed 15 minutes once tripped (unlike the recovery rate
// limiter's rolling one-hour window), so this is the fallback a missing `Retry-After` header
// gets.
const LOCKOUT_FALLBACK_SECONDS = 15 * 60;

export type SessionOutcome =
  | { kind: "ok"; userId: string; displayName: string }
  | { kind: "unauthenticated" }
  | { kind: "failed" };

export type AuthenticationOptionsOutcome =
  | { kind: "ok"; value: PublicKeyCredentialRequestOptionsJSON }
  | { kind: "failed" };

export type AuthenticateOutcome =
  | { kind: "ok" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type SignOutOutcome = { kind: "ok" } | { kind: "failed" };

function retryAfterSeconds(response: Response): number {
  const header = response.headers.get("Retry-After");
  const seconds = header ? Number(header) : Number.NaN;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : LOCKOUT_FALLBACK_SECONDS;
}

function postJson(path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

/** Resolves the signed-in user's identity, or that no session is live (`GET /users/session`). */
export async function fetchSession(): Promise<SessionOutcome> {
  let response: Response;
  try {
    response = await fetch("/users/session");
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (!response.ok) {
    return { kind: "failed" };
  }
  const body = (await response.json()) as { user_id: string; display_name: string };
  return { kind: "ok", userId: body.user_id, displayName: body.display_name };
}

/** Hands back WebAuthn request options for a discoverable credential, for the browser's own passkey picker to resolve. */
export async function fetchAuthenticationOptions(): Promise<AuthenticationOptionsOutcome> {
  let response: Response;
  try {
    response = await postJson("/users/session/authentication-options");
  } catch {
    return { kind: "failed" };
  }
  if (!response.ok) {
    return { kind: "failed" };
  }
  const body = (await response.json()) as {
    passkey_authentication_options: PublicKeyCredentialRequestOptionsJSON;
  };
  return { kind: "ok", value: body.passkey_authentication_options };
}

/** Verifies the browser's WebAuthn assertion and opens a fresh session on success; the cloud gives no distinction between an unknown credential and a bad signature. */
export async function authenticate(
  assertion: AuthenticationResponseJSON,
): Promise<AuthenticateOutcome> {
  let response: Response;
  try {
    response = await postJson("/users/session/authenticate", { assertion });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    return { kind: "ok" };
  }
  if (response.status === 429) {
    return { kind: "rate_limited", retryAfterSeconds: retryAfterSeconds(response) };
  }
  return { kind: "failed" };
}

/**
 * Ends the current session, and reports whether the cloud actually ended it: a sign-out the cloud
 * never heard leaves the session live and its cookie in the browser, so the caller must not act
 * as though the person is out. A 401 is the cloud saying there is no session left to end, which
 * is the same outcome the person asked for.
 */
export async function signOut(): Promise<SignOutOutcome> {
  let response: Response;
  try {
    response = await postJson("/users/session/sign-out");
  } catch {
    return { kind: "failed" };
  }
  if (response.ok || response.status === 401) {
    return { kind: "ok" };
  }
  return { kind: "failed" };
}
