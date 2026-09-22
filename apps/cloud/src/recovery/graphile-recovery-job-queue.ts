import { randomUUID } from "node:crypto";
import type { WorkerUtils } from "graphile-worker";
import type { RecoveryRequestJobPayload } from "./process-recovery-request-job.js";
import type { RecoveryJobQueue } from "./recovery-job-queue.js";
import { RECOVERY_REQUEST_TASK_IDENTIFIER } from "./recovery-worker.js";

/**
 * Enqueues through one `WorkerUtils` the caller creates at startup and releases on shutdown, so
 * every request reuses its connection pool instead of opening a connection of its own. Only an
 * admitted request ever reaches this queue (a rejected one is audited synchronously, see
 * `recovery-rejected-attempt-accumulator.ts`), so there is no rejected backlog to keep from
 * delaying a link's own job, and every job runs at the default priority.
 */
export function createGraphileRecoveryJobQueue(
  workerUtils: Pick<WorkerUtils, "addJob">,
): RecoveryJobQueue {
  return {
    async enqueueRecoveryRequest(request) {
      const payload: RecoveryRequestJobPayload = {
        email: request.email,
        requestedAt: request.requestedAt.toISOString(),
        requestId: randomUUID(),
      };
      await workerUtils.addJob(RECOVERY_REQUEST_TASK_IDENTIFIER, payload);
    },
  };
}
