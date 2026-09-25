import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";

// The sign-in lockout blocks for a fixed 15 minutes once tripped (unlike the recovery rate
// limiter's rolling one-hour window), so this is the fallback a missing `Retry-After` header
// gets.
const LOCKOUT_FALLBACK_SECONDS = 15 * 60;
// The backoffice API rate limiter counts a rolling one-hour window, the same fallback
// recoveryApi.ts's own rate-limited outcomes fall back to.
const BACKOFFICE_RATE_LIMIT_FALLBACK_SECONDS = 60 * 60;

export type SessionOutcome =
  | {
      kind: "ok";
      userId: string;
      displayName: string;
      isAdministrator: boolean;
      expiresAt?: string;
      /** The signed-in user's permission keys, in catalog order; an Administrator holds every key. */
      permissions?: string[];
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
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type SignOutOutcome =
  | { kind: "ok" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type SessionAuthorizationOptionsOutcome =
  | { kind: "ok"; value: PublicKeyCredentialRequestOptionsJSON }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type AuthorizeSessionOutcome =
  | { kind: "ok" }
  | { kind: "unauthenticated" }
  | { kind: "authentication_failed" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

function retryAfterSeconds(response: Response, fallbackSeconds: number): number {
  const header = response.headers.get("Retry-After");
  const seconds = header ? Number(header) : Number.NaN;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : fallbackSeconds;
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
  if (response.status === 429) {
    return {
      kind: "rate_limited",
      retryAfterSeconds: retryAfterSeconds(response, BACKOFFICE_RATE_LIMIT_FALLBACK_SECONDS),
    };
  }
  if (!response.ok) {
    return { kind: "failed" };
  }
  const body = (await response.json()) as {
    user_id: string;
    display_name: string;
    is_administrator: boolean;
    expires_at?: string;
    permissions?: string[];
  };
  return {
    kind: "ok",
    userId: body.user_id,
    displayName: body.display_name,
    isAdministrator: body.is_administrator,
    ...(body.expires_at !== undefined ? { expiresAt: body.expires_at } : {}),
    ...(body.permissions !== undefined ? { permissions: body.permissions } : {}),
  };
}

/**
 * Looks the session up the same way `fetchSession` does, but without touching `last_seen_at`
 * (`GET /users/session/status`), so an open tab can probe for expiry, revocation or deactivation
 * without keeping an idle session alive.
 */
export async function checkSessionStatus(): Promise<SessionStatusOutcome> {
  let response: Response;
  try {
    response = await fetch("/users/session/status");
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (response.status === 429) {
    return {
      kind: "rate_limited",
      retryAfterSeconds: retryAfterSeconds(response, BACKOFFICE_RATE_LIMIT_FALLBACK_SECONDS),
    };
  }
  if (!response.ok) {
    return { kind: "failed" };
  }
  const body = (await response.json()) as { expires_at: string };
  return { kind: "ok", expiresAt: body.expires_at };
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
    return {
      kind: "rate_limited",
      retryAfterSeconds: retryAfterSeconds(response, LOCKOUT_FALLBACK_SECONDS),
    };
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
  if (response.status === 429) {
    return {
      kind: "rate_limited",
      retryAfterSeconds: retryAfterSeconds(response, BACKOFFICE_RATE_LIMIT_FALLBACK_SECONDS),
    };
  }
  return { kind: "failed" };
}

/**
 * Hands back WebAuthn request options against the session's own account's passkeys, for the
 * shared step-up modal's "Usar mi passkey" (`POST /users/session/authorization-options`).
 */
export async function fetchSessionAuthorizationOptions(): Promise<SessionAuthorizationOptionsOutcome> {
  let response: Response;
  try {
    response = await postJson("/users/session/authorization-options");
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (response.status === 429) {
    return {
      kind: "rate_limited",
      retryAfterSeconds: retryAfterSeconds(response, BACKOFFICE_RATE_LIMIT_FALLBACK_SECONDS),
    };
  }
  if (!response.ok) {
    return { kind: "failed" };
  }
  const body = (await response.json()) as {
    authorization_options: PublicKeyCredentialRequestOptionsJSON;
  };
  return { kind: "ok", value: body.authorization_options };
}

/**
 * Verifies the WebAuthn assertion and opens (or refreshes) the session's 5-minute passkey
 * authorization window, covering every sensitive backoffice action for that long
 * (`POST /users/session/authorization`).
 */
export async function authorizeSession(
  assertion: AuthenticationResponseJSON,
): Promise<AuthorizeSessionOutcome> {
  let response: Response;
  try {
    response = await postJson("/users/session/authorization", { authorization: assertion });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    return { kind: "ok" };
  }
  if (response.status === 401) {
    const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
    return body?.code === "authentication_failed"
      ? { kind: "authentication_failed" }
      : { kind: "unauthenticated" };
  }
  if (response.status === 429) {
    return {
      kind: "rate_limited",
      retryAfterSeconds: retryAfterSeconds(response, BACKOFFICE_RATE_LIMIT_FALLBACK_SECONDS),
    };
  }
  return { kind: "failed" };
}
