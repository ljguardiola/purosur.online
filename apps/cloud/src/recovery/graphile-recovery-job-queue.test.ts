import { describe, expect, it, vi } from "vitest";
import { createGraphileRecoveryJobQueue } from "./graphile-recovery-job-queue.js";
import { RECOVERY_REQUEST_TASK_IDENTIFIER } from "./recovery-worker.js";

describe("createGraphileRecoveryJobQueue", () => {
  it("enqueues a recovery-request job for the given request against the configured database", async () => {
    const addJobAdhoc = vi.fn().mockResolvedValue(undefined);
    const jobQueue = createGraphileRecoveryJobQueue("postgres://user:pass@db/purosur", {
      addJobAdhoc,
    });

    await jobQueue.enqueueRecoveryRequest({
      email: "ada@example.com",
      requestedAt: new Date("2026-01-05T12:00:00.000Z"),
      admitted: false,
    });

    expect(addJobAdhoc).toHaveBeenCalledWith(
      { connectionString: "postgres://user:pass@db/purosur" },
      RECOVERY_REQUEST_TASK_IDENTIFIER,
      { email: "ada@example.com", requestedAt: "2026-01-05T12:00:00.000Z", admitted: false },
    );
  });
});
