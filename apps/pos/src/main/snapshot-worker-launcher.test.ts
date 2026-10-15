import { describe, expect, it } from "vitest";
import {
  createSnapshotWorkerLauncher,
  readSnapshotWorkerLaunch,
  type SnapshotWorkerProcess,
} from "./snapshot-worker-launcher";

const JOB = { kind: "upload_pending", device_token: "t", cloud_url: "https://c.test", folder: "f" };
const LAUNCH = { type: "launch-snapshot-worker", time_limit_ms: 60_000, job: JOB };

describe("readSnapshotWorkerLaunch", () => {
  it("reads a request to launch a worker, keeping its job as it came", () => {
    expect(readSnapshotWorkerLaunch(LAUNCH)).toEqual({ timeLimitMs: 60_000, job: JOB });
  });

  it.each([
    ["null", null],
    ["text", "launch-snapshot-worker"],
    ["another type", { ...LAUNCH, type: "health-check" }],
    ["no time limit", { type: LAUNCH.type, job: JOB }],
    ["a time limit of zero", { ...LAUNCH, time_limit_ms: 0 }],
    ["a negative time limit", { ...LAUNCH, time_limit_ms: -1 }],
    ["a fractional time limit", { ...LAUNCH, time_limit_ms: 1.5 }],
    ["a time limit that is not a number", { ...LAUNCH, time_limit_ms: "60000" }],
    ["no job", { type: LAUNCH.type, time_limit_ms: 60_000 }],
    ["a job that is null", { ...LAUNCH, job: null }],
    ["a job that is text", { ...LAUNCH, job: "take" }],
    ["a job that is a list", { ...LAUNCH, job: [] }],
  ])("refuses a message with %s", (_name, message) => {
    expect(readSnapshotWorkerLaunch(message)).toBeUndefined();
  });
});

class FakeWorker implements SnapshotWorkerProcess {
  posted: unknown[] = [];
  killed = 0;
  stdout = null;
  stderr = null;
  private exitListener: ((code: number | null) => void) | undefined;

  once(_event: "exit", listener: (code: number | null) => void): void {
    this.exitListener = listener;
  }

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  kill(): void {
    this.killed += 1;
  }

  exit(code: number | null): void {
    this.exitListener?.(code);
  }
}

interface Timer {
  run: () => void;
  delayMs: number;
  cancelled: boolean;
}

function setup(options: { forkFails?: boolean } = {}) {
  const workers: FakeWorker[] = [];
  const timers: Timer[] = [];
  const notices: unknown[] = [];
  const launcher = createSnapshotWorkerLauncher({
    fork: () => {
      if (options.forkFails) {
        throw new Error("cannot fork");
      }
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
    startTimer: (run, delayMs) => {
      const timer: Timer = { run, delayMs, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    notifyCore: (notice) => notices.push(notice),
  });
  return { launcher, workers, timers, notices };
}

const EXITED = { type: "snapshot-worker-exited" };

describe("createSnapshotWorkerLauncher", () => {
  it("forks a worker and hands it the job", () => {
    const { launcher, workers } = setup();

    launcher.handleCoreMessage(LAUNCH);

    expect(workers).toHaveLength(1);
    expect(workers[0]?.posted).toEqual([JOB]);
  });

  it("stops the worker once its time limit passes", () => {
    const { launcher, workers, timers } = setup();
    launcher.handleCoreMessage({ ...LAUNCH, time_limit_ms: 45_000 });

    expect(timers.map((timer) => timer.delayMs)).toEqual([45_000]);
    timers[0]?.run();

    expect(workers[0]?.killed).toBe(1);
  });

  it("tells the core when the worker exits on its own and stops the timer", () => {
    const { launcher, workers, timers, notices } = setup();
    launcher.handleCoreMessage(LAUNCH);

    workers[0]?.exit(0);

    expect(notices).toEqual([EXITED]);
    expect(timers[0]?.cancelled).toBe(true);
  });

  it("tells the core when the worker exits because it was stopped", () => {
    const { launcher, workers, timers, notices } = setup();
    launcher.handleCoreMessage(LAUNCH);
    timers[0]?.run();

    expect(notices).toEqual([]);
    workers[0]?.exit(null);

    expect(notices).toEqual([EXITED]);
  });

  it("tells the core about a worker that exits with an error", () => {
    const { launcher, workers, notices } = setup();
    launcher.handleCoreMessage(LAUNCH);

    workers[0]?.exit(1);

    expect(notices).toEqual([EXITED]);
  });

  it("runs one worker at a time, ignoring a request made while one runs", () => {
    const { launcher, workers, timers } = setup();
    launcher.handleCoreMessage(LAUNCH);

    launcher.handleCoreMessage(LAUNCH);

    expect(workers).toHaveLength(1);
    expect(timers).toHaveLength(1);
  });

  it("launches another worker once the earlier one has exited", () => {
    const { launcher, workers } = setup();
    launcher.handleCoreMessage(LAUNCH);
    workers[0]?.exit(0);

    launcher.handleCoreMessage(LAUNCH);

    expect(workers).toHaveLength(2);
  });

  it("does not stop a worker a late timer was meant for after it exited", () => {
    const { launcher, workers, timers } = setup();
    launcher.handleCoreMessage(LAUNCH);
    workers[0]?.exit(0);
    launcher.handleCoreMessage(LAUNCH);

    timers[0]?.run();

    expect(workers[1]?.killed).toBe(0);
  });

  it("ignores messages that are not a valid request", () => {
    const { launcher, workers, notices } = setup();

    launcher.handleCoreMessage({ type: "launch-snapshot-worker" });
    launcher.handleCoreMessage({ type: "core-ready" });
    launcher.handleCoreMessage(undefined);

    expect(workers).toEqual([]);
    expect(notices).toEqual([]);
  });

  it("tells the core at once when the worker cannot be forked, and stays free to try again", () => {
    const { launcher, notices, timers } = setup({ forkFails: true });

    launcher.handleCoreMessage(LAUNCH);
    launcher.handleCoreMessage(LAUNCH);

    expect(notices).toEqual([EXITED, EXITED]);
    expect(timers).toEqual([]);
  });

  it("stops a running worker when main stops it", () => {
    const { launcher, workers } = setup();
    launcher.handleCoreMessage(LAUNCH);

    launcher.stop();

    expect(workers[0]?.killed).toBe(1);
  });

  it("stops nothing when no worker runs", () => {
    const { launcher } = setup();

    expect(() => launcher.stop()).not.toThrow();
  });
});
