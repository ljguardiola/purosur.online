import type { WorkerUtils } from "graphile-worker";
import type { RecoveryRequestJobPayload } from "./process-recovery-request-job.js";
import type { RecoveryJobQueue } from "./recovery-job-queue.js";
import { RECOVERY_REQUEST_TASK_IDENTIFIER } from "./recovery-worker.js";

/**
 * Enqueues through one `WorkerUtils` the caller creates at startup and releases on shutdown, so
 * every request reuses its connection pool instead of opening a connection of its own.
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
      };
      await workerUtils.addJob(RECOVERY_REQUEST_TASK_IDENTIFIER, payload);
    },
  };
}
