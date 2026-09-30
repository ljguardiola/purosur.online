import {
  openSessionSchema,
  type SessionAuthenticationBody,
  type SessionAuthorizationBody,
  sessionAuthenticationOptionsSchema,
  sessionAuthorizationOptionsSchema,
  sessionStatusSchema,
} from "@purosur/contracts";
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
      // In catalog order. An Administrator holds every key implicitly.
      permissions: string[];
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
    response = await fetch("/api/users/session");
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
    permissions: body.data.permissions,
  };
}

// Unlike `fetchSession`, doesn't touch `last_seen_at`, so a probing tab can't keep an idle session alive.
export async function checkSessionStatus(): Promise<SessionStatusOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/users/session/status");
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
    response = await postJson("/api/users/session/authentication-options");
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
    response = await postJson("/api/users/session/authenticate", requestBody);
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
    response = await postJson("/api/users/session/sign-out");
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

export async function fetchSessionAuthorizationOptions(): Promise<SessionAuthorizationOptionsOutcome> {
  let response: Response;
  try {
    response = await postJson("/api/users/session/authorization-options");
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
  const body = sessionAuthorizationOptionsSchema.safeParse(
    await response.json().catch(() => undefined),
  );
  if (!body.success) {
    return { kind: "failed" };
  }
  return { kind: "ok", value: body.data.authorization_options };
}

export async function authorizeSession(
  assertion: AuthenticationResponseJSON,
): Promise<AuthorizeSessionOutcome> {
  const requestBody: SessionAuthorizationBody = { authorization: assertion };
  let response: Response;
  try {
    response = await postJson("/api/users/session/authorization", requestBody);
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
      retryAfterSeconds: retryAfterSeconds(response),
    };
  }
  return { kind: "failed" };
}
