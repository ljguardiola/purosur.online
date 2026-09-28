import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readEmail } from "./email-validation.js";
import { reportRecoveryBookkeepingError } from "./recovery-error-reporting.js";
import type { RecoveryJobQueue } from "./recovery-job-queue.js";
import { hashDestinationAddress, recordRecoveryRequestAttempt } from "./recovery-rate-limiter.js";
import { recordRejectedAttempt } from "./recovery-rejected-attempt-accumulator.js";
import { resolveSourceAddress } from "./recovery-source-address.js";
import { PUBLIC_ACCESS, registerRouteAccess } from "./route-access.js";

export interface RecoveryRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  jobQueue: RecoveryJobQueue;
  backofficeOrigin: string;
  now?: () => Date;
  recordRejectedAttempt?: typeof recordRejectedAttempt;
  reportError?: (error: unknown) => void;
}

/** Does the same work for every well-formed address, so nothing about the response depends on
 * whether it belongs to a real account. */
export function registerRecoveryRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RecoveryRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const doRecordRejectedAttempt = options.recordRejectedAttempt ?? recordRejectedAttempt;
  const reportError = options.reportError ?? reportRecoveryBookkeepingError;

  app.post(
    "/users/recovery/request",
    { config: { access: PUBLIC_ACCESS } },
    async (request, reply) => {
      if (request.headers.origin !== options.backofficeOrigin) {
        await reply.code(403).send({
          code: "origin_rejected",
          message: "the request's Origin does not match the backoffice's own origin",
        });
        return;
      }

      const email = readEmail(request.body);
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
        // Upsert, never a lookup, so known and unknown addresses do identical work.
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
    },
  );
}
