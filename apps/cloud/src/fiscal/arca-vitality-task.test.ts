import type { JobHelpers } from "graphile-worker";
import { describe, expect, it, vi } from "vitest";
import {
  ARCA_VITALITY_CHECK_TASK_IDENTIFIER,
  ARCA_VITALITY_WATCHDOG_TASK_IDENTIFIER,
  arcaVitalityJobs,
} from "./arca-vitality-task.js";

const NOW = new Date("2026-06-01T12:00:00.000Z");
const NEXT_CHECK_AT = new Date("2026-06-01T12:00:30.000Z");
const vitality = { check: vi.fn() };

function helpersOf(overrides: Record<string, unknown> = {}) {
  const fakeClient = { marker: "fake-client" };
  const addJob = vi.fn().mockResolvedValue(undefined);
  const withPgClient = vi.fn(async (callback: (client: unknown) => Promise<unknown>) =>
    callback(fakeClient),
  );
  return {
    fakeClient,
    addJob,
    helpers: { addJob, withPgClient, ...overrides } as unknown as JobHelpers,
  };
}

function taskOf(jobs: ReturnType<typeof arcaVitalityJobs>, identifier: string) {
  const task = jobs.taskList[identifier];
  if (!task) {
    throw new Error(`test setup: expected the registered task ${identifier}`);
  }
  return task;
}

describe("arcaVitalityJobs", () => {
  it("registers the check and its watchdog, and runs the watchdog every minute", () => {
    const jobs = arcaVitalityJobs({ now: () => NOW, vitality });

    expect(jobs.taskList[ARCA_VITALITY_CHECK_TASK_IDENTIFIER]).toBeInstanceOf(Function);
    expect(jobs.taskList[ARCA_VITALITY_WATCHDOG_TASK_IDENTIFIER]).toBeInstanceOf(Function);
    expect(jobs.crontab).toEqual(["* * * * * arca-vitality-watchdog"]);
  });

  it("checks through a client borrowed from graphile-worker's pool, with the injected service and clock", async () => {
    const fakeDb = { marker: "fake-db" };
    const createDatabase = vi.fn().mockReturnValue(fakeDb);
    const check = vi.fn().mockResolvedValue({ kind: "ok" });
    const { helpers, fakeClient } = helpersOf();
    const jobs = arcaVitalityJobs({ now: () => NOW, vitality }, { createDatabase, check });

    await taskOf(jobs, ARCA_VITALITY_CHECK_TASK_IDENTIFIER)({}, helpers);

    expect(createDatabase).toHaveBeenCalledWith(fakeClient);
    const [dbArgument, optionsArgument] = check.mock.calls[0] as [
      unknown,
      { now: () => Date; vitality: unknown },
    ];
    expect(dbArgument).toBe(fakeDb);
    expect(optionsArgument.vitality).toBe(vitality);
    expect(optionsArgument.now()).toEqual(NOW);
  });

  it("schedules the next check 30 seconds on, replacing any check already scheduled under its key", async () => {
    const { helpers, addJob } = helpersOf();
    const jobs = arcaVitalityJobs(
      { now: () => NOW, vitality },
      { createDatabase: vi.fn(), check: vi.fn().mockResolvedValue({ kind: "ok" }) },
    );

    await taskOf(jobs, ARCA_VITALITY_CHECK_TASK_IDENTIFIER)({}, helpers);

    expect(addJob).toHaveBeenCalledWith(
      ARCA_VITALITY_CHECK_TASK_IDENTIFIER,
      {},
      {
        jobKey: ARCA_VITALITY_CHECK_TASK_IDENTIFIER,
        jobKeyMode: "replace",
        runAt: NEXT_CHECK_AT,
      },
    );
  });

  it("schedules the next check even when recording this one failed", async () => {
    const { helpers, addJob } = helpersOf();
    const jobs = arcaVitalityJobs(
      { now: () => NOW, vitality },
      { createDatabase: vi.fn(), check: vi.fn().mockRejectedValue(new Error("store down")) },
    );

    await expect(taskOf(jobs, ARCA_VITALITY_CHECK_TASK_IDENTIFIER)({}, helpers)).rejects.toThrow(
      "store down",
    );

    expect(addJob).toHaveBeenCalledTimes(1);
  });

  it("has the watchdog add the check under the same key, keeping the run time of one already scheduled", async () => {
    const { helpers, addJob } = helpersOf();
    const jobs = arcaVitalityJobs({ now: () => NOW, vitality });

    await taskOf(jobs, ARCA_VITALITY_WATCHDOG_TASK_IDENTIFIER)({}, helpers);

    expect(addJob).toHaveBeenCalledWith(
      ARCA_VITALITY_CHECK_TASK_IDENTIFIER,
      {},
      { jobKey: ARCA_VITALITY_CHECK_TASK_IDENTIFIER, jobKeyMode: "preserve_run_at" },
    );
  });
});
