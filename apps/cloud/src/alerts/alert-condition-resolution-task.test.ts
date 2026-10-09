import type { JobHelpers } from "graphile-worker";
import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import {
  ALERT_CONDITION_RESOLUTION_TASK_IDENTIFIER,
  alertConditionResolutionJobs,
} from "./alert-condition-resolution-task.js";

function jobHelpers(client: PoolClient, borrowed: () => void): JobHelpers {
  return {
    withPgClient: (callback) => {
      borrowed();
      return callback(client);
    },
  } as JobHelpers;
}

describe("alertConditionResolutionJobs", () => {
  it("registers the alert condition resolution task and schedules it every minute", () => {
    const jobs = alertConditionResolutionJobs({ now: () => new Date() });

    expect(jobs.taskList[ALERT_CONDITION_RESOLUTION_TASK_IDENTIFIER]).toBeInstanceOf(Function);
    expect(jobs.crontab).toContain("* * * * * alert-condition-resolution");
  });

  it("processes the task through a client borrowed from graphile-worker's own pool", async () => {
    const fakeClient: PoolClient = Object.create(null);
    const fakeDb = { marker: "fake-db" };
    const createDatabase = vi.fn().mockReturnValue(fakeDb);
    const borrowed = vi.fn();
    const resolve = vi.fn().mockResolvedValue(0);
    const detectQuiet = vi.fn().mockResolvedValue(0);

    const jobs = alertConditionResolutionJobs(
      { now: () => new Date("2026-01-05T12:00:00.000Z") },
      { createDatabase, resolve, detectQuiet },
    );
    const task = jobs.taskList[ALERT_CONDITION_RESOLUTION_TASK_IDENTIFIER];
    if (!task) {
      throw new Error("test setup: expected the registered alert condition resolution task");
    }

    await task({}, jobHelpers(fakeClient, borrowed));

    expect(borrowed).toHaveBeenCalledTimes(1);
    expect(createDatabase).toHaveBeenCalledWith(fakeClient);
    expect(resolve).toHaveBeenCalledTimes(1);
    const [dbArgument, depsArgument] = resolve.mock.calls[0] as [unknown, { now: () => Date }];
    expect(dbArgument).toBe(fakeDb);
    expect(depsArgument.now()).toEqual(new Date("2026-01-05T12:00:00.000Z"));
  });

  it("looks for quiet registers right after resolving the cleared conditions, on the same database and by the same clock", async () => {
    const fakeClient: PoolClient = Object.create(null);
    const fakeDb = { marker: "fake-db" };
    const calls: string[] = [];
    const resolve = vi.fn().mockImplementation(async () => {
      calls.push("resolve");
      return 0;
    });
    const detectQuiet = vi.fn().mockImplementation(async () => {
      calls.push("detectQuiet");
      return 0;
    });

    const jobs = alertConditionResolutionJobs(
      { now: () => new Date("2026-01-05T12:00:00.000Z") },
      { createDatabase: vi.fn().mockReturnValue(fakeDb), resolve, detectQuiet },
    );
    const task = jobs.taskList[ALERT_CONDITION_RESOLUTION_TASK_IDENTIFIER];
    if (!task) {
      throw new Error("test setup: expected the registered alert condition resolution task");
    }

    await task({}, jobHelpers(fakeClient, vi.fn()));

    expect(calls).toEqual(["resolve", "detectQuiet"]);
    const [dbArgument, depsArgument] = detectQuiet.mock.calls[0] as [unknown, { now: () => Date }];
    expect(dbArgument).toBe(fakeDb);
    expect(depsArgument.now()).toEqual(new Date("2026-01-05T12:00:00.000Z"));
  });
});
