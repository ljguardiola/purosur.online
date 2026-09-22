import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { reportRecoveryBookkeepingError } from "./recovery-error-reporting.js";
import type { RecoveryJobQueue } from "./recovery-job-queue.js";
import { hashDestinationAddress, recordRecoveryRequestAttempt } from "./recovery-rate-limiter.js";
import { recordRejectedAttempt } from "./recovery-rejected-attempt-accumulator.js";
import { resolveSourceAddress } from "./recovery-source-address.js";

export interface RecoveryRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  jobQueue: RecoveryJobQueue;
  backofficeOrigin: string;
  /** Injected in tests so the rate limiter's rolling one-hour window is deterministic. */
  now?: () => Date;
  /** Injected in tests to prove a bookkeeping failure never turns the 429 into a 500. */
  recordRejectedAttempt?: typeof recordRejectedAttempt;
  /** Injected in tests; defaults to logging and reporting to Sentry. */
  reportError?: (error: unknown) => void;
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/;
// The longest address SMTP can deliver to (RFC 5321's 256-octet path minus its angle brackets).
const EMAIL_MAX_LENGTH = 254;

function normalizeEmail(rawEmail: unknown): string | undefined {
  if (typeof rawEmail !== "string") {
    return undefined;
  }
  const email = rawEmail.trim().toLowerCase();
  return email.length <= EMAIL_MAX_LENGTH && EMAIL_SHAPE.test(email) ? email : undefined;
}

/**
 * Registers `POST /users/recovery/request` (§9.7, D44, issue #167). Does the same work for every
 * well-formed address — both rolling one-hour limits, then one unconditional job enqueue — and
 * answers with no body, so nothing about the response depends on whether that address belongs
 * to a real account.
 */
export function registerRecoveryRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RecoveryRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  const doRecordRejectedAttempt = options.recordRejectedAttempt ?? recordRejectedAttempt;
  const reportError = options.reportError ?? reportRecoveryBookkeepingError;

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

    const sourceAddress = resolveSourceAddress(request);
    const requestedAt = now();

    const rateLimit = await recordRecoveryRequestAttempt(options.db, {
      destinationAddress: email,
      sourceAddress,
      now: requestedAt,
    });
    if (!rateLimit.allowed) {
      // One synchronous upsert, never a lookup: the same work whether or not this address
      // belongs to a real account (issue #167, "rejected for exceeding the hourly limits are
      // recorded grouped"). A bookkeeping failure here must never turn this 429 into a 500.
      try {
        await doRecordRejectedAttempt(options.db, {
          kind: "request",
          keyHash: hashDestinationAddress(email),
          now: requestedAt,
        });
      } catch (error) {
        reportError(error);
      }
      await reply
        .header("Retry-After", String(rateLimit.retryAfterSeconds))
        .code(429)
        .send({ code: "rate_limited", message: "too many recovery-link requests" });
      return;
    }

    await options.jobQueue.enqueueRecoveryRequest({ email, requestedAt });
    await reply.code(200).send();
  });
}
