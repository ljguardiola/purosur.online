import type { JobHelpers } from "graphile-worker";
import { describe, expect, it, vi } from "vitest";
import {
  ALERT_CONDITION_RESOLUTION_TASK_IDENTIFIER,
  alertConditionResolutionJobs,
} from "./alert-condition-resolution-task.js";

describe("alertConditionResolutionJobs", () => {
  it("registers the alert condition resolution task and schedules it every minute", () => {
    const jobs = alertConditionResolutionJobs({ now: () => new Date() });

    expect(jobs.taskList[ALERT_CONDITION_RESOLUTION_TASK_IDENTIFIER]).toBeInstanceOf(Function);
    expect(jobs.crontab).toContain("* * * * * alert-condition-resolution");
  });

  it("processes the task through a client borrowed from graphile-worker's own pool", async () => {
    const fakeClient = { marker: "fake-client" };
    const fakeDb = { marker: "fake-db" };
    const createDatabase = vi.fn().mockReturnValue(fakeDb);
    const withPgClient = vi.fn(async (callback: (client: unknown) => Promise<unknown>) =>
      callback(fakeClient),
    );
    const resolve = vi.fn().mockResolvedValue(0);

    const jobs = alertConditionResolutionJobs(
      { now: () => new Date("2026-01-05T12:00:00.000Z") },
      { createDatabase, resolve },
    );
    const task = jobs.taskList[ALERT_CONDITION_RESOLUTION_TASK_IDENTIFIER];
    if (!task) {
      throw new Error("test setup: expected the registered alert condition resolution task");
    }

    await task({}, { withPgClient } as unknown as JobHelpers);

    expect(withPgClient).toHaveBeenCalledTimes(1);
    expect(createDatabase).toHaveBeenCalledWith(fakeClient);
    expect(resolve).toHaveBeenCalledTimes(1);
    const [dbArgument, depsArgument] = resolve.mock.calls[0] as [unknown, { now: () => Date }];
    expect(dbArgument).toBe(fakeDb);
    expect(depsArgument.now()).toEqual(new Date("2026-01-05T12:00:00.000Z"));
  });
});
