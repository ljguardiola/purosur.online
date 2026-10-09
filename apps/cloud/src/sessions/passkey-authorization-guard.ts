import { hasValidPasskeyAuthorization } from "@purosur/domain";
import type { FastifyReply } from "fastify";

export const AUTHORIZATION_REQUIRED_RESPONSE = {
  code: "authorization_required",
  message: "a fresh passkey authorization is required for this action",
} as const;

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
