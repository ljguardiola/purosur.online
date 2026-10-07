import { cloudError, cloudErrorStatus } from "@purosur/contracts";
import type { FastifyReply } from "fastify";

export async function sendRateLimited(
  reply: FastifyReply,
  message: string,
  retryAfterSeconds: number,
): Promise<void> {
  await reply
    .code(cloudErrorStatus("rate_limited"))
    .header("Retry-After", String(retryAfterSeconds))
    .send(cloudError("rate_limited", message, [{ retry_after_seconds: retryAfterSeconds }]));
}
