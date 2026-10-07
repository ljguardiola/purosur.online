import type { JobHelpers } from "graphile-worker";
import { describe, expect, it, vi } from "vitest";
import {
  ARCA_CERTIFICATE_EXPIRY_CHECK_TASK_IDENTIFIER,
  arcaCertificateExpiryJobs,
  enqueueArcaCertificateExpiryCheck,
} from "./arca-certificate-expiry-task.js";

const NOW = new Date("2026-06-01T12:00:00.000Z");
const NOT_AFTER = new Date("2026-06-21T12:00:00.000Z");

describe("arcaCertificateExpiryJobs", () => {
  it("registers the certificate expiry check task and schedules it once a day", () => {
    const jobs = arcaCertificateExpiryJobs({
      now: () => NOW,
      environment: "production",
      notAfter: NOT_AFTER,
    });

    expect(jobs.taskList[ARCA_CERTIFICATE_EXPIRY_CHECK_TASK_IDENTIFIER]).toBeInstanceOf(Function);
    expect(jobs.crontab).toEqual(["15 3 * * * arca-certificate-expiry-check"]);
  });

  it("checks the configured environment and expiry through a client borrowed from graphile-worker's own pool", async () => {
    const fakeClient = { marker: "fake-client" };
    const fakeDb = { marker: "fake-db" };
    const createDatabase = vi.fn().mockReturnValue(fakeDb);
    const withPgClient = vi.fn(async (callback: (client: unknown) => Promise<unknown>) =>
      callback(fakeClient),
    );
    const check = vi.fn().mockResolvedValue({ kind: "opened" });

    const jobs = arcaCertificateExpiryJobs(
      { now: () => NOW, environment: "production", notAfter: NOT_AFTER },
      { createDatabase, check },
    );
    const task = jobs.taskList[ARCA_CERTIFICATE_EXPIRY_CHECK_TASK_IDENTIFIER];
    if (!task) {
      throw new Error("test setup: expected the registered certificate expiry check task");
    }

    await task({}, { withPgClient } as unknown as JobHelpers);

    expect(createDatabase).toHaveBeenCalledWith(fakeClient);
    expect(check).toHaveBeenCalledTimes(1);
    const [dbArgument, inputArgument] = check.mock.calls[0] as [
      unknown,
      { now: () => Date; environment: string; notAfter: Date },
    ];
    expect(dbArgument).toBe(fakeDb);
    expect(inputArgument.environment).toBe("production");
    expect(inputArgument.notAfter).toEqual(NOT_AFTER);
    expect(inputArgument.now()).toEqual(NOW);
  });
});

describe("enqueueArcaCertificateExpiryCheck", () => {
  it("enqueues the check under a job key, so a burst of restarts leaves one pending job", async () => {
    const addJob = vi.fn().mockResolvedValue(undefined);

    await enqueueArcaCertificateExpiryCheck({ addJob });

    expect(addJob).toHaveBeenCalledWith(
      ARCA_CERTIFICATE_EXPIRY_CHECK_TASK_IDENTIFIER,
      {},
      { jobKey: ARCA_CERTIFICATE_EXPIRY_CHECK_TASK_IDENTIFIER },
    );
  });
});
