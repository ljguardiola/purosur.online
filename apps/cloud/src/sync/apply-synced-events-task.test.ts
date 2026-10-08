import type { ApplyPendingEventsOutcome } from "@purosur/domain/sync/use-cases";
import { describe, expect, it, vi } from "vitest";
import { buildJobHelpers } from "../test-support/job-helpers.js";
import {
  APPLY_SYNCED_EVENTS_TASK_IDENTIFIER,
  applySyncedEventsJobs,
} from "./apply-synced-events-task.js";

const NOW = new Date("2026-10-06T15:00:00.000Z");

function taskOf(jobs: ReturnType<typeof applySyncedEventsJobs>) {
  const task = jobs.taskList[APPLY_SYNCED_EVENTS_TASK_IDENTIFIER];
  if (!task) {
    throw new Error("test setup: expected the registered apply synced events task");
  }
  return task;
}

const processed = (limitReached: boolean): ApplyPendingEventsOutcome => ({
  kind: "processed",
  applied: 1,
  flagged: 0,
  retried: 0,
  quarantined: 0,
  busy: 0,
  limitReached,
});

describe("applySyncedEventsJobs", () => {
  it("registers the apply synced events task and sweeps it every minute so due retries are tried", () => {
    const jobs = applySyncedEventsJobs({ now: () => NOW });

    expect(jobs.taskList[APPLY_SYNCED_EVENTS_TASK_IDENTIFIER]).toBeInstanceOf(Function);
    expect(jobs.crontab).toContain("* * * * * apply-synced-events");
  });

  it("applies events through a client borrowed from graphile-worker's own pool, by the clock it is handed", async () => {
    const fakeDb = { marker: "fake-db" };
    const createDatabase = vi.fn().mockReturnValue(fakeDb);
    const apply = vi.fn().mockResolvedValue({ kind: "idle" });
    const { borrowClient, helpers, client: fakeClient } = buildJobHelpers();

    await taskOf(applySyncedEventsJobs({ now: () => NOW }, { createDatabase, apply }))({}, helpers);

    expect(borrowClient).toHaveBeenCalledTimes(1);
    expect(createDatabase).toHaveBeenCalledWith(fakeClient);
    expect(apply).toHaveBeenCalledTimes(1);
    const [dbArgument, depsArgument] = apply.mock.calls[0] as [unknown, { now: () => Date }];
    expect(dbArgument).toBe(fakeDb);
    expect(depsArgument.now()).toEqual(NOW);
  });

  it("queues itself again when the batch ended with events left to apply", async () => {
    const apply = vi.fn().mockResolvedValue(processed(true));
    const { addJob, helpers } = buildJobHelpers();

    await taskOf(applySyncedEventsJobs({ now: () => NOW }, { createDatabase: vi.fn(), apply }))(
      {},
      helpers,
    );

    expect(addJob).toHaveBeenCalledWith(
      APPLY_SYNCED_EVENTS_TASK_IDENTIFIER,
      {},
      { jobKey: APPLY_SYNCED_EVENTS_TASK_IDENTIFIER },
    );
  });

  it.each([
    ["nothing to apply", { kind: "idle" } as ApplyPendingEventsOutcome],
    ["a batch that applied every event waiting", processed(false)],
  ])("does not queue itself again after %s", async (_name, outcome) => {
    const apply = vi.fn().mockResolvedValue(outcome);
    const { addJob, helpers } = buildJobHelpers();

    await taskOf(applySyncedEventsJobs({ now: () => NOW }, { createDatabase: vi.fn(), apply }))(
      {},
      helpers,
    );

    expect(addJob).not.toHaveBeenCalled();
  });
});
