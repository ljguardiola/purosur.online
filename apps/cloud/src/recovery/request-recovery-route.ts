import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import type { RecoveryJobQueue } from "./recovery-job-queue.js";
import { recordRecoveryRequestAttempt } from "./recovery-rate-limiter.js";

export interface RecoveryRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  jobQueue: RecoveryJobQueue;
  backofficeOrigin: string;
  /** Injected in tests so the rate limiter's fixed hourly window is deterministic. */
  now?: () => Date;
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/;

function normalizeEmail(rawEmail: unknown): string | undefined {
  if (typeof rawEmail !== "string") {
    return undefined;
  }
  const email = rawEmail.trim().toLowerCase();
  return EMAIL_SHAPE.test(email) ? email : undefined;
}

const RATE_LIMIT_WINDOW_SECONDS = 60 * 60;

/**
 * Registers `POST /users/recovery/request` (§9.7, D44, issue #167). Does the same work for every
 * well-formed address — both hourly limits, then one unconditional job enqueue — and answers with
 * no body, so nothing about the response depends on whether that address belongs to a real
 * account.
 */
export function registerRecoveryRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RecoveryRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());

  app.post("/users/recovery/request", async (request, reply) => {
    // No session exists on this path, so cross-site request forgery is checked the same way §11
    // fixes for every other unauthenticated, state-changing request from the backoffice: the
    // Origin header verified against the backoffice's own origin. The doc names no error code for
    // this rejection; `origin_rejected` follows the shared `{ code, message, details }` envelope.
    if (request.headers.origin !== options.backofficeOrigin) {
      await reply.code(403).send({
        code: "origin_rejected",
        message: "the request's Origin does not match the backoffice's own origin",
      });
      return;
    }

    const body = request.body as { email?: unknown } | undefined;
    const email = normalizeEmail(body?.email);
    if (!email) {
      await reply.code(400).send({
        code: "validation_failed",
        message: "email must look like local@domain",
        details: [{ field: "email" }],
      });
      return;
    }

    // Railway terminates TLS and sets X-Real-IP; request.ip is only a fallback for an
    // environment without that proxy in front (e.g. running the service directly in tests).
    const forwardedIp = request.headers["x-real-ip"];
    const sourceAddress = typeof forwardedIp === "string" ? forwardedIp : request.ip;

    const { allowed } = await recordRecoveryRequestAttempt(options.db, {
      destinationAddress: email,
      sourceAddress,
      now: now(),
    });
    if (!allowed) {
      await reply
        .header("Retry-After", String(RATE_LIMIT_WINDOW_SECONDS))
        .code(429)
        .send({ code: "rate_limited", message: "too many recovery-link requests" });
      return;
    }

    await options.jobQueue.enqueueRecoveryRequest(email);
    await reply.code(200).send();
  });
}
