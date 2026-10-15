import { describe, expect, it } from "vitest";
import { runSnapshotCycle } from "./run-snapshot-cycle.js";
import {
  FakeSnapshotCycleState,
  RecordingSnapshotLog,
  RecordingSnapshotWorkerLauncher,
  SequentialIds,
} from "./test-support/fake-snapshot-cycle.js";

function setup() {
  const state = new FakeSnapshotCycleState();
  const launcher = new RecordingSnapshotWorkerLauncher();
  const ids = new SequentialIds();
  const log = new RecordingSnapshotLog();
  const input = { current: { lastDeviceSeq: 11, pullCursor: 20 } };
  return {
    state,
    launcher,
    ids,
    log,
    input,
    run: () => runSnapshotCycle({ state, launcher, ids, log }, input),
  };
}

describe("runSnapshotCycle", () => {
  it("launches a worker that takes a snapshot under a new generation id", async () => {
    const { run, launcher } = setup();

    const outcome = await run();

    const job = {
      kind: "take",
      generationId: "generation-1",
      sequences: { lastDeviceSeq: 11, pullCursor: 20 },
    } as const;
    expect(outcome).toEqual({ kind: "launched", job });
    expect(launcher.launched).toEqual([job]);
  });

  it("takes the first snapshot when there is no generation yet", async () => {
    const { run, state, launcher } = setup();
    state.last = undefined;

    await run();

    expect(launcher.launched).toHaveLength(1);
  });

  it("launches nothing for a register whose sequences have not moved", async () => {
    const { run, input, launcher, ids } = setup();
    input.current = { lastDeviceSeq: 10, pullCursor: 20 };

    const outcome = await run();

    expect(outcome).toEqual({ kind: "skipped", reason: "unchanged" });
    expect(launcher.launched).toEqual([]);
    expect(ids.issued).toBe(0);
  });

  it.each([
    [
      "the battery is low",
      "battery_low",
      (state: FakeSnapshotCycleState) => {
        state.batteryReading = { kind: "present", chargePercent: 19, onBattery: true };
      },
    ],
    [
      "the disk is low",
      "disk_low",
      (state: FakeSnapshotCycleState) => {
        state.storageReading = { diskFreeBytes: 1, diskFreeRatio: 0.5, walSizeBytes: 0 };
      },
    ],
    [
      "the log is oversized",
      "wal_oversized",
      (state: FakeSnapshotCycleState) => {
        state.storageReading = {
          diskFreeBytes: 100 * 1024 * 1024 * 1024,
          diskFreeRatio: 0.5,
          walSizeBytes: 257 * 1024 * 1024,
        };
      },
    ],
  ] as const)("launches no snapshot while %s", async (_when, reason, apply) => {
    const { run, state, launcher, ids } = setup();
    apply(state);

    const outcome = await run();

    expect(outcome).toEqual({ kind: "skipped", reason });
    expect(launcher.launched).toEqual([]);
    expect(ids.issued).toBe(0);
  });

  it("launches a worker that only uploads when a floor blocks the snapshot and generations wait", async () => {
    const { run, state, launcher, ids } = setup();
    state.batteryReading = { kind: "present", chargePercent: 3, onBattery: true };
    state.pending = true;

    const outcome = await run();

    expect(outcome).toEqual({ kind: "launched", job: { kind: "upload_pending" } });
    expect(launcher.launched).toEqual([{ kind: "upload_pending" }]);
    expect(ids.issued).toBe(0);
  });

  it("does not launch an upload while the cloud is unreachable", async () => {
    const { run, state, input, launcher } = setup();
    input.current = { lastDeviceSeq: 10, pullCursor: 20 };
    state.pending = true;
    state.reachable = false;

    const outcome = await run();

    expect(outcome).toEqual({ kind: "skipped", reason: "unchanged" });
    expect(launcher.launched).toEqual([]);
  });

  it("takes a new snapshot while an earlier generation waits to be uploaded", async () => {
    const { run, state } = setup();
    state.pending = true;

    const outcome = await run();

    expect(outcome).toMatchObject({ kind: "launched", job: { kind: "take" } });
  });

  it("reports that nothing was launched when the launcher cannot launch the job", async () => {
    const { run, launcher } = setup();
    launcher.available = false;

    const outcome = await run();

    expect(outcome).toEqual({ kind: "launch_unavailable" });
    expect(launcher.launched).toEqual([]);
  });

  it("asks for the log to be checkpointed when an oversized log is why it skipped", async () => {
    const { run, state, log } = setup();
    state.storageReading = {
      diskFreeBytes: 100 * 1024 * 1024 * 1024,
      diskFreeRatio: 0.5,
      walSizeBytes: 257 * 1024 * 1024,
    };

    await run();

    expect(log.checkpoints).toBe(1);
  });

  it.each([
    [
      "unchanged",
      ({ input }: ReturnType<typeof setup>) => {
        input.current = { lastDeviceSeq: 10, pullCursor: 20 };
      },
    ],
    [
      "battery_low",
      ({ state }: ReturnType<typeof setup>) => {
        state.batteryReading = { kind: "present", chargePercent: 1, onBattery: true };
      },
    ],
  ] as const)("does not checkpoint the log when it skipped as %s", async (_reason, apply) => {
    const cycle = setup();
    const { run, log } = cycle;
    apply(cycle);

    await run();

    expect(log.checkpoints).toBe(0);
  });

  it("leaves the log to the worker's exit when it launches one despite an oversized log", async () => {
    const { run, state, log, launcher } = setup();
    state.storageReading = {
      diskFreeBytes: 100 * 1024 * 1024 * 1024,
      diskFreeRatio: 0.5,
      walSizeBytes: 257 * 1024 * 1024,
    };
    state.pending = true;

    await run();

    expect(launcher.launched).toEqual([{ kind: "upload_pending" }]);
    expect(log.checkpoints).toBe(0);
  });
});
