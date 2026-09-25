import type { FastifyReply } from "fastify";

/**
 * How long a successful passkey authorization covers every sensitive backoffice action for, from
 * the moment it succeeds: a fresh passkey
 * sign-in or `POST /users/session/authorization` (`session-authorization-route.ts`), whichever
 * happened most recently. Not consumed by use: a covered action neither shortens nor resets it.
 */
export const PASSKEY_AUTHORIZATION_WINDOW_MS = 5 * 60 * 1000;

export const AUTHORIZATION_REQUIRED_RESPONSE = {
  code: "authorization_required",
  message: "a fresh passkey authorization is required for this action",
} as const;

/**
 * True while `passkeyAuthorizedAt` is set and at most `PASSKEY_AUTHORIZATION_WINDOW_MS` old,
 * evaluated against `now`; exactly 5 minutes still counts.
 */
export function hasValidPasskeyAuthorization(
  session: { passkeyAuthorizedAt: Date | null },
  now: Date,
): boolean {
  if (!session.passkeyAuthorizedAt) {
    return false;
  }
  return now.getTime() - session.passkeyAuthorizedAt.getTime() <= PASSKEY_AUTHORIZATION_WINDOW_MS;
}

/**
 * Requires the session to carry a still-valid passkey authorization before a sensitive backoffice
 * action runs. Every route this guards calls it after checking origin, session, permission, and
 * input validation, and before its mutation: an authorization is never consumed by passing this
 * check, so one successful passkey authorization keeps covering further sensitive actions for the
 * rest of its 5-minute window. Answers 401 `authorization_required` and returns `false` when the
 * window is missing or has elapsed.
 */
export async function requirePasskeyAuthorization(
  session: { passkeyAuthorizedAt: Date | null },
  reply: FastifyReply,
  now: Date,
): Promise<boolean> {
  if (hasValidPasskeyAuthorization(session, now)) {
    return true;
  }
  await reply.code(401).send(AUTHORIZATION_REQUIRED_RESPONSE);
  return false;
}
