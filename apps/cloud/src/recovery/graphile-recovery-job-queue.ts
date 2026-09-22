import { randomUUID } from "node:crypto";
import type { WorkerUtils } from "graphile-worker";
import type { RecoveryRequestJobPayload } from "./process-recovery-request-job.js";
import type { RecoveryJobQueue } from "./recovery-job-queue.js";
import { RECOVERY_REQUEST_TASK_IDENTIFIER } from "./recovery-worker.js";

// graphile-worker runs numerically smaller priorities first (default 0).
const AUDIT_ONLY_PRIORITY = 1;

/**
 * Enqueues through one `WorkerUtils` the caller creates at startup and releases on shutdown, so
 * every request reuses its connection pool instead of opening a connection of its own. A rejected
 * request's job only audits, and a flood of them must never delay an admitted request's link,
 * which expires in 15 minutes: they run at a lower priority, so a worker slot that frees up
 * always takes a waiting admitted request first.
 */
export function createGraphileRecoveryJobQueue(
  workerUtils: Pick<WorkerUtils, "addJob">,
): RecoveryJobQueue {
  return {
    async enqueueRecoveryRequest(request) {
      const payload: RecoveryRequestJobPayload = {
        email: request.email,
        requestedAt: request.requestedAt.toISOString(),
        admitted: request.admitted,
        requestId: randomUUID(),
      };
      await workerUtils.addJob(
        RECOVERY_REQUEST_TASK_IDENTIFIER,
        payload,
        request.admitted ? {} : { priority: AUDIT_ONLY_PRIORITY },
      );
    },
  };
}
