import type { FastifyReply } from "fastify";

/** Not consumed by use: a covered sensitive action neither shortens nor resets this window. */
export const PASSKEY_AUTHORIZATION_WINDOW_MS = 5 * 60 * 1000;

export const AUTHORIZATION_REQUIRED_RESPONSE = {
  code: "authorization_required",
  message: "a fresh passkey authorization is required for this action",
} as const;

export function hasValidPasskeyAuthorization(
  session: { passkeyAuthorizedAt: Date | null },
  now: Date,
): boolean {
  if (!session.passkeyAuthorizedAt) {
    return false;
  }
  return now.getTime() - session.passkeyAuthorizedAt.getTime() <= PASSKEY_AUTHORIZATION_WINDOW_MS;
}

/** Never consumed by passing this check, so one successful authorization keeps covering further sensitive actions for the rest of its window. */
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
