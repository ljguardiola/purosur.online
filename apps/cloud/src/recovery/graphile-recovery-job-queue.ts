import { addJobAdhoc } from "graphile-worker";
import type { RecoveryRequestJobPayload } from "./process-recovery-request-job.js";
import type { RecoveryJobQueue } from "./recovery-job-queue.js";
import { RECOVERY_REQUEST_TASK_IDENTIFIER } from "./recovery-worker.js";

export interface GraphileRecoveryJobQueueDeps {
  /**
   * Injected in tests; defaults to graphile-worker's own `addJobAdhoc`, which opens and closes
   * its own short-lived database connection per call — acceptable at this endpoint's volume.
   */
  addJobAdhoc?: typeof addJobAdhoc;
}

export function createGraphileRecoveryJobQueue(
  databaseUrl: string,
  deps: GraphileRecoveryJobQueueDeps = {},
): RecoveryJobQueue {
  const doAddJob = deps.addJobAdhoc ?? addJobAdhoc;

  return {
    async enqueueRecoveryRequest(request) {
      const payload: RecoveryRequestJobPayload = {
        email: request.email,
        requestedAt: request.requestedAt.toISOString(),
        admitted: request.admitted,
      };
      await doAddJob({ connectionString: databaseUrl }, RECOVERY_REQUEST_TASK_IDENTIFIER, payload);
    },
  };
}
