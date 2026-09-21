import { describe, expect, it, vi } from "vitest";
import {
  type CoreSupervisorDeps,
  createCoreSupervisor,
  decideRestart,
  type SupervisedProcess,
} from "./core-supervisor";

const policy = { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1000, stableRunMs: 60_000 };

describe("decideRestart", () => {
  it("restarts with exponentially growing backoff below the attempt limit", () => {
    expect(decideRestart(0, policy)).toEqual({ shouldRestart: true, delayMs: 100 });
    expect(decideRestart(1, policy)).toEqual({ shouldRestart: true, delayMs: 200 });
    expect(decideRestart(2, policy)).toEqual({ shouldRestart: true, delayMs: 400 });
  });

  it("caps the backoff delay at the configured maximum", () => {
    expect(decideRestart(5, { ...policy, maxAttempts: 10 })).toEqual({
      shouldRestart: true,
      delayMs: 1000,
    });
  });

  it("stops restarting once the attempt limit is reached", () => {
    expect(decideRestart(3, policy)).toEqual({ shouldRestart: false, delayMs: 0 });
  });
});

class FakeProcess implements SupervisedProcess {
  killed = false;
  private exitListener: ((code: number | null) => void) | undefined;

  once(_event: "exit", listener: (code: number | null) => void): void {
    this.exitListener = listener;
  }

  kill(): void {
    this.killed = true;
  }

  exit(code: number | null): void {
    this.exitListener?.(code);
  }
}

function setUp(overrides: Partial<CoreSupervisorDeps> = {}) {
  const processes: FakeProcess[] = [];
  let clock = 0;
  const fork = vi.fn(() => {
    const process = new FakeProcess();
    processes.push(process);
    return process;
  });
  const deps: CoreSupervisorDeps = {
    fork,
    scheduleRestart: vi.fn(),
    now: () => clock,
    policy,
    ...overrides,
  };
  const supervisor = createCoreSupervisor(deps);
  return {
    supervisor,
    processes,
    fork,
    advanceClock: (ms: number) => {
      clock += ms;
    },
  };
}

describe("createCoreSupervisor", () => {
  it("forks the core process once on start", () => {
    const { supervisor, fork } = setUp();

    supervisor.start();

    expect(fork).toHaveBeenCalledOnce();
  });

  it("schedules a restart with backoff after an unexpected exit", () => {
    const scheduleRestart = vi.fn();
    const { supervisor, processes } = setUp({ scheduleRestart });

    supervisor.start();
    processes[0]?.exit(1);

    expect(scheduleRestart).toHaveBeenCalledExactlyOnceWith(expect.any(Function), 100);
  });

  it("forks again once the scheduled restart runs", () => {
    const { supervisor, processes, fork } = setUp({
      scheduleRestart: vi.fn((run: () => void) => run()),
    });

    supervisor.start();
    processes[0]?.exit(1);

    expect(fork).toHaveBeenCalledTimes(2);
  });

  it("treats an exit with code 0 that nobody asked for as a crash", () => {
    const scheduleRestart = vi.fn();
    const { supervisor, processes } = setUp({ scheduleRestart });

    supervisor.start();
    processes[0]?.exit(0);

    expect(scheduleRestart).toHaveBeenCalledExactlyOnceWith(expect.any(Function), 100);
  });

  it("reports exhaustion once the attempt limit is reached instead of scheduling forever", () => {
    const onRestartsExhausted = vi.fn();
    const { supervisor, processes, fork } = setUp({
      scheduleRestart: vi.fn((run: () => void) => run()),
      onRestartsExhausted,
    });

    supervisor.start();
    // Each exit forks a fresh process synchronously (scheduleRestart runs `run` right away
    // here), so re-checking `processes.length` on every turn keeps walking the chain of
    // restarts until the policy gives up.
    for (let index = 0; index < processes.length; index += 1) {
      processes[index]?.exit(1);
    }

    expect(onRestartsExhausted).toHaveBeenCalledOnce();
    expect(fork).toHaveBeenCalledTimes(policy.maxAttempts + 1);
  });

  it("starts counting attempts afresh after the core has stayed up for a stable period", () => {
    const scheduleRestart = vi.fn((run: () => void) => run());
    const onRestartsExhausted = vi.fn();
    const { supervisor, processes, advanceClock } = setUp({ scheduleRestart, onRestartsExhausted });

    supervisor.start();
    processes[0]?.exit(1);
    processes[1]?.exit(1);
    processes[2]?.exit(1);
    advanceClock(policy.stableRunMs);
    processes[3]?.exit(1);

    expect(onRestartsExhausted).not.toHaveBeenCalled();
    expect(scheduleRestart).toHaveBeenLastCalledWith(expect.any(Function), policy.baseDelayMs);
  });

  it("keeps counting attempts when the core crashes again before a stable period", () => {
    const onRestartsExhausted = vi.fn();
    const { supervisor, processes, advanceClock } = setUp({
      scheduleRestart: vi.fn((run: () => void) => run()),
      onRestartsExhausted,
    });

    supervisor.start();
    for (let index = 0; index < processes.length; index += 1) {
      advanceClock(policy.stableRunMs - 1);
      processes[index]?.exit(1);
    }

    expect(onRestartsExhausted).toHaveBeenCalledOnce();
  });

  it("calls onProcessStarted with every forked process, including restarts", () => {
    const onProcessStarted = vi.fn();
    const { supervisor, processes } = setUp({
      scheduleRestart: vi.fn((run: () => void) => run()),
      onProcessStarted,
    });

    supervisor.start();
    processes[0]?.exit(1);

    expect(onProcessStarted).toHaveBeenCalledTimes(2);
    expect(onProcessStarted).toHaveBeenNthCalledWith(1, processes[0]);
    expect(onProcessStarted).toHaveBeenNthCalledWith(2, processes[1]);
  });

  it("calls onProcessExited with the process that exited, before any restart", () => {
    const events: string[] = [];
    const { supervisor, processes } = setUp({
      scheduleRestart: vi.fn((run: () => void) => run()),
      onProcessStarted: (process) =>
        events.push(`started ${processes.indexOf(process as FakeProcess)}`),
      onProcessExited: (process) =>
        events.push(`exited ${processes.indexOf(process as FakeProcess)}`),
    });

    supervisor.start();
    processes[0]?.exit(1);

    expect(events).toEqual(["started 0", "exited 0", "started 1"]);
  });

  it("calls onProcessExited when the core stays down after exhausting its attempts", () => {
    const onProcessExited = vi.fn();
    const { supervisor, processes } = setUp({
      scheduleRestart: vi.fn((run: () => void) => run()),
      onProcessExited,
    });

    supervisor.start();
    for (let index = 0; index < processes.length; index += 1) {
      processes[index]?.exit(1);
    }

    expect(onProcessExited).toHaveBeenLastCalledWith(processes.at(-1));
  });

  it("stop() prevents a restart from being scheduled for a later exit", () => {
    const scheduleRestart = vi.fn();
    const { supervisor, processes } = setUp({ scheduleRestart });

    supervisor.start();
    supervisor.stop();
    processes[0]?.exit(1);

    expect(scheduleRestart).not.toHaveBeenCalled();
  });

  it("stop() asks the running core process to exit", () => {
    const { supervisor, processes } = setUp();

    supervisor.start();
    supervisor.stop();

    expect(processes[0]?.killed).toBe(true);
  });

  it("stop() cancels a restart that was already scheduled", () => {
    let pendingRestart: (() => void) | undefined;
    const { supervisor, processes, fork } = setUp({
      scheduleRestart: vi.fn((run: () => void) => {
        pendingRestart = run;
      }),
    });

    supervisor.start();
    processes[0]?.exit(1);
    supervisor.stop();
    pendingRestart?.();

    expect(fork).toHaveBeenCalledOnce();
  });
});
