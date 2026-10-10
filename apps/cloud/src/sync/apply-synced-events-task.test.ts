import { FICTIONAL_CUIT, FICTIONAL_LEGAL_NAME } from "@purosur/domain/fiscal/test-support";
import type { ApplyPendingEventsOutcome, QuarantinedEvent } from "@purosur/domain/sync/use-cases";
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

const processed = (
  limitReached: boolean,
  quarantined: QuarantinedEvent[] = [],
): ApplyPendingEventsOutcome => ({
  kind: "processed",
  applied: 1,
  flagged: 0,
  retried: 0,
  quarantined,
  busy: 0,
  limitReached,
});

const quarantinedEvent = (overrides: Partial<QuarantinedEvent> = {}): QuarantinedEvent => ({
  deviceId: "device-1",
  eventId: "event-1",
  eventType: "sale_print_state_changed",
  aggregateType: "Sale",
  aggregateId: "sale-1",
  error: "installation device-1 is not a known register",
  ...overrides,
});

async function runReporting(outcome: ApplyPendingEventsOutcome) {
  const apply = vi.fn().mockResolvedValue(outcome);
  const report = vi.fn();
  const { helpers } = buildJobHelpers();

  await taskOf(
    applySyncedEventsJobs({ now: () => NOW }, { createDatabase: vi.fn(), apply, report }),
  )({}, helpers);

  return report;
}

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

  it("reports each event the run quarantined once, with its type, id, aggregate and last error", async () => {
    const report = await runReporting(
      processed(false, [
        quarantinedEvent(),
        quarantinedEvent({ eventId: "event-2", aggregateId: "sale-2", error: "unreadable" }),
      ]),
    );

    expect(report).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenNthCalledWith(
      1,
      "sync: a synced event was quarantined",
      new Error("installation device-1 is not a known register"),
      {
        context: {
          deviceId: "device-1",
          eventId: "event-1",
          eventType: "sale_print_state_changed",
          aggregateType: "Sale",
          aggregateId: "sale-1",
        },
      },
    );
    expect(report).toHaveBeenNthCalledWith(
      2,
      "sync: a synced event was quarantined",
      new Error("unreadable"),
      expect.objectContaining({ context: expect.objectContaining({ eventId: "event-2" }) }),
    );
  });

  it("reports a failed query's statement without the values it was given", async () => {
    const report = await runReporting(
      processed(false, [
        quarantinedEvent({
          error: `Failed query: insert into "customers" ("cuit", "name") values ($1, $2)\nparams: ${FICTIONAL_CUIT},${FICTIONAL_LEGAL_NAME}`,
        }),
      ]),
    );

    expect(report).toHaveBeenCalledExactlyOnceWith(
      "sync: a synced event was quarantined",
      new Error('Failed query: insert into "customers" ("cuit", "name") values ($1, $2)'),
      expect.anything(),
    );
    const reported = JSON.stringify(report.mock.calls, (_key, value: unknown) =>
      value instanceof Error ? value.message : value,
    );
    expect(reported).not.toContain(FICTIONAL_CUIT);
    expect(reported).not.toContain(FICTIONAL_LEGAL_NAME);
  });

  it.each([
    ["nothing to apply", { kind: "idle" } as ApplyPendingEventsOutcome],
    ["a batch whose failures are all retried later", { ...processed(false), retried: 3 }],
  ])("reports nothing after %s", async (_name, outcome) => {
    const report = await runReporting(outcome);

    expect(report).not.toHaveBeenCalled();
  });
});
