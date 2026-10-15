import type { RunSnapshotCycleOutcome } from "@purosur/domain/register/use-cases";
import { describe, expect, it } from "vitest";
import { createSnapshotCycleSchedule } from "./snapshot-cycle-schedule";

const LAUNCHED: RunSnapshotCycleOutcome = {
  kind: "launched",
  job: { kind: "upload_pending" },
};
const SKIPPED: RunSnapshotCycleOutcome = { kind: "skipped", reason: "unchanged" };
const FIVE_MINUTES = 5 * 60 * 1000;
const THIRTY_MINUTES = 30 * 60 * 1000;

function setup(options: { reachable?: boolean; outcome?: RunSnapshotCycleOutcome } = {}) {
  const state = { reachable: options.reachable ?? true, outcome: options.outcome ?? LAUNCHED };
  const scheduled: { run: () => Promise<void>; delayMs: number; cancelled: boolean }[] = [];
  const events: string[] = [];
  const failures: unknown[] = [];
  const behavior = {
    runCycle: async (): Promise<RunSnapshotCycleOutcome> => {
      events.push("cycle");
      return state.outcome;
    },
    checkpoint: (): void => {
      events.push("checkpoint");
    },
  };
  const schedule = createSnapshotCycleSchedule({
    runCycle: () => behavior.runCycle(),
    cloudReachable: () => state.reachable,
    scheduleNext: (run, delayMs) => {
      const entry = { run, delayMs, cancelled: false };
      scheduled.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
    checkpoint: () => behavior.checkpoint(),
    onFailure: (error) => failures.push(error),
  });
  async function tick(): Promise<void> {
    await scheduled.at(-1)?.run();
  }
  return { schedule, scheduled, events, failures, state, behavior, tick };
}

describe("createSnapshotCycleSchedule", () => {
  it("waits five minutes for the first cycle while the cloud is reachable", () => {
    const { schedule, scheduled } = setup({ reachable: true });

    schedule.start();

    expect(scheduled.map((entry) => entry.delayMs)).toEqual([FIVE_MINUTES]);
  });

  it("waits thirty minutes for the first cycle while the cloud is not reachable", () => {
    const { schedule, scheduled } = setup({ reachable: false });

    schedule.start();

    expect(scheduled.map((entry) => entry.delayMs)).toEqual([THIRTY_MINUTES]);
  });

  it("runs a cycle when its time comes and schedules the next one by the cloud's reachability then", async () => {
    const { schedule, scheduled, events, state, tick } = setup({ outcome: SKIPPED });
    schedule.start();
    state.reachable = false;

    await tick();

    expect(events).toEqual(["cycle"]);
    expect(scheduled.map((entry) => entry.delayMs)).toEqual([FIVE_MINUTES, THIRTY_MINUTES]);
  });

  it("runs no cycle while the worker it launched has not exited", async () => {
    const { schedule, scheduled, events, tick } = setup({ outcome: LAUNCHED });
    schedule.start();
    await tick();

    await tick();
    await tick();

    expect(events).toEqual(["cycle"]);
    expect(scheduled).toHaveLength(4);
  });

  it("runs the next cycle once the worker has exited", async () => {
    const { schedule, events, tick } = setup({ outcome: LAUNCHED });
    schedule.start();
    await tick();

    schedule.workerExited();
    await tick();

    expect(events).toEqual(["cycle", "checkpoint", "cycle"]);
  });

  it("keeps running cycles when the cycle skipped", async () => {
    const { schedule, events, tick } = setup({ outcome: SKIPPED });
    schedule.start();

    await tick();
    await tick();

    expect(events).toEqual(["cycle", "cycle"]);
  });

  it("keeps running cycles when no worker could be launched", async () => {
    const { schedule, events, tick } = setup({ outcome: { kind: "launch_unavailable" } });
    schedule.start();

    await tick();
    await tick();

    expect(events).toEqual(["cycle", "cycle"]);
  });

  it("checkpoints the log only after a worker has exited", async () => {
    const { schedule, events, tick } = setup({ outcome: SKIPPED });
    schedule.start();
    await tick();
    expect(events).not.toContain("checkpoint");

    schedule.workerExited();

    expect(events).toEqual(["cycle", "checkpoint"]);
  });

  it("clears the worker in flight on the exit of one an earlier core launched", async () => {
    const { schedule, events, tick } = setup({ outcome: SKIPPED });
    schedule.start();

    schedule.workerExited();
    await tick();

    expect(events).toEqual(["checkpoint", "cycle"]);
  });

  it("reports a cycle that fails and carries on with the next one", async () => {
    const { schedule, scheduled, failures, behavior, tick } = setup();
    const failure = new Error("cannot read the battery");
    behavior.runCycle = async () => {
      throw failure;
    };
    schedule.start();

    await tick();

    expect(failures).toEqual([failure]);
    expect(scheduled).toHaveLength(2);
  });

  it("reports a checkpoint that fails and still lets the next cycle run", async () => {
    const { schedule, events, failures, behavior, tick } = setup({ outcome: LAUNCHED });
    const failure = new Error("database is locked");
    behavior.checkpoint = () => {
      throw failure;
    };
    schedule.start();
    await tick();

    schedule.workerExited();
    await tick();

    expect(failures).toEqual([failure]);
    expect(events).toEqual(["cycle", "cycle"]);
  });
});
