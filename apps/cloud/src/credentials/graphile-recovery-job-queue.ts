import { randomUUID } from "node:crypto";
import type { WorkerUtils } from "graphile-worker";
import type { RecoveryJobQueue } from "./recovery-job-queue.js";
import { recoveryRequestJobPayloadSchema } from "./recovery-request-job-payload.js";
import { RECOVERY_REQUEST_TASK_IDENTIFIER } from "./recovery-worker.js";

export function createGraphileRecoveryJobQueue(
  workerUtils: Pick<WorkerUtils, "addJob">,
): RecoveryJobQueue {
  return {
    async enqueueRecoveryRequest(request) {
      const payload = recoveryRequestJobPayloadSchema.parse({
        email: request.email,
        requestedAt: request.requestedAt.toISOString(),
        requestId: randomUUID(),
      });
      await workerUtils.addJob(RECOVERY_REQUEST_TASK_IDENTIFIER, payload);
    },
  };
}
