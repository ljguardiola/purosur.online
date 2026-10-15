import { describe, expect, it, vi } from "vitest";
import { buildJobHelpers } from "../test-support/job-helpers.js";
import {
  UNVERIFIED_OFFSITE_DUMP_CHECK_TASK_IDENTIFIER,
  unverifiedOffsiteDumpJobs,
} from "./unverified-offsite-dump-task.js";

const NOW = new Date("2026-10-14T12:00:00.000Z");

describe("unverifiedOffsiteDumpJobs", () => {
  it("registers the detection task and schedules it every hour", () => {
    const jobs = unverifiedOffsiteDumpJobs({ now: () => NOW, environment: "production" });

    expect(jobs.taskList[UNVERIFIED_OFFSITE_DUMP_CHECK_TASK_IDENTIFIER]).toBeInstanceOf(Function);
    expect(jobs.crontab).toEqual(["0 * * * * unverified-offsite-dump-check"]);
  });

  it("detects for the configured environment through a client borrowed from graphile-worker's own pool", async () => {
    const { helpers, client: fakeClient } = buildJobHelpers();
    const fakeDb = { marker: "fake-db" };
    const createDatabase = vi.fn().mockReturnValue(fakeDb);
    const detect = vi.fn().mockResolvedValue({ kind: "verified", night: "2026-10-14" });

    const jobs = unverifiedOffsiteDumpJobs(
      { now: () => NOW, environment: "production" },
      { createDatabase, detect },
    );
    const task = jobs.taskList[UNVERIFIED_OFFSITE_DUMP_CHECK_TASK_IDENTIFIER];
    if (!task) {
      throw new Error("test setup: expected the registered detection task");
    }

    await task({}, helpers);

    expect(createDatabase).toHaveBeenCalledWith(fakeClient);
    expect(detect).toHaveBeenCalledTimes(1);
    const [dbArgument, inputArgument] = detect.mock.calls[0] as [
      unknown,
      { now: () => Date; environment: string },
    ];
    expect(dbArgument).toBe(fakeDb);
    expect(inputArgument.environment).toBe("production");
    expect(inputArgument.now()).toEqual(NOW);
  });
});
