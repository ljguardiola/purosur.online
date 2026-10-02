import {
  type SessionAuthorizationBody,
  sessionAuthorizationOptionsSchema,
} from "@purosur/contracts";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { rateLimitOutcome } from "./rate-limit-outcome";

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

function sendJson(method: "POST" | "PUT", path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

function postJson(path: string, body?: unknown): Promise<Response> {
  return sendJson("POST", path, body);
}

export async function fetchSessionAuthorizationOptions(): Promise<SessionAuthorizationOptionsOutcome> {
  let response: Response;
  try {
    response = await postJson("/api/sessions/current/authorization-challenges");
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (response.status === 429) {
    return rateLimitOutcome(response);
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
    response = await sendJson("PUT", "/api/sessions/current/authorization", requestBody);
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
    return rateLimitOutcome(response);
  }
  return { kind: "failed" };
}
