import { describe, expect, it, vi } from "vitest";
import { createGraphileRecoveryJobQueue } from "./graphile-recovery-job-queue.js";
import { RECOVERY_REQUEST_TASK_IDENTIFIER } from "./recovery-worker.js";

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("createGraphileRecoveryJobQueue", () => {
  it("enqueues a recovery-request job for the given request through the shared worker utils", async () => {
    const workerUtils = { addJob: vi.fn().mockResolvedValue(undefined) };
    const jobQueue = createGraphileRecoveryJobQueue(workerUtils);

    await jobQueue.enqueueRecoveryRequest({
      email: "ada@example.com",
      requestedAt: new Date("2026-01-05T12:00:00.000Z"),
      admitted: false,
    });
    await jobQueue.enqueueRecoveryRequest({
      email: "grace@example.com",
      requestedAt: new Date("2026-01-05T12:01:00.000Z"),
      admitted: true,
    });

    expect(workerUtils.addJob).toHaveBeenNthCalledWith(1, RECOVERY_REQUEST_TASK_IDENTIFIER, {
      email: "ada@example.com",
      requestedAt: "2026-01-05T12:00:00.000Z",
      admitted: false,
      requestId: expect.stringMatching(UUID_SHAPE),
    });
    expect(workerUtils.addJob).toHaveBeenNthCalledWith(2, RECOVERY_REQUEST_TASK_IDENTIFIER, {
      email: "grace@example.com",
      requestedAt: "2026-01-05T12:01:00.000Z",
      admitted: true,
      requestId: expect.stringMatching(UUID_SHAPE),
    });
    const [firstPayload, secondPayload] = workerUtils.addJob.mock.calls.map(
      ([, payload]) => payload as { requestId: string },
    );
    expect(firstPayload?.requestId).not.toBe(secondPayload?.requestId);
  });
});
