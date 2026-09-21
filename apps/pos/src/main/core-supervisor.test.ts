import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type CoreSupervisorDeps,
  createCoreSupervisor,
  decideRestart,
  type SupervisedProcess,
} from "./core-supervisor";

const policy = { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1000, stableRunMs: 60_000 };
const retryIntervalMs = 90_000;
const readinessTimeoutMs = 30_000;

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
  private messageListener: ((message: unknown) => void) | undefined;

  once(_event: "exit", listener: (code: number | null) => void): void {
    this.exitListener = listener;
  }

  on(_event: "message", listener: (message: unknown) => void): void {
    this.messageListener = listener;
  }

  send(message: unknown): void {
    this.messageListener?.(message);
  }

  becomeReady(): void {
    this.send({ type: "core-ready" });
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
    retryIntervalMs,
    scheduleReadinessDeadline: vi.fn(() => () => {}),
    readinessTimeoutMs,
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

  it("reports the core up only once the started process says it is ready", () => {
    const onStatusChange = vi.fn();
    const { supervisor, processes } = setUp({ onStatusChange });

    supervisor.start();
    expect(onStatusChange).not.toHaveBeenCalled();

    processes[0]?.becomeReady();

    expect(onStatusChange).toHaveBeenCalledExactlyOnceWith("up");
  });

  it("ignores any other message from the core process", () => {
    const onStatusChange = vi.fn();
    const { supervisor, processes } = setUp({ onStatusChange });

    supervisor.start();
    processes[0]?.send({ type: "something-else" });
    processes[0]?.send("core-ready");

    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it("reports the core starting again when a ready core crashes into a bounded restart", () => {
    const onStatusChange = vi.fn();
    const { supervisor, processes } = setUp({ onStatusChange });

    supervisor.start();
    processes[0]?.becomeReady();
    processes[0]?.exit(1);

    expect(onStatusChange).toHaveBeenLastCalledWith("starting");
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
      scheduleRestart: vi.fn((run: () => void) => {
        run();
        return () => {};
      }),
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

  it("reports exhaustion once the bounded attempt limit is first reached", () => {
    const onRestartsExhausted = vi.fn();
    const { supervisor, processes, fork } = setUp({
      scheduleRestart: vi.fn((run: () => void) => {
        run();
        return () => {};
      }),
      onRestartsExhausted,
    });

    supervisor.start();
    // Each exit forks a fresh process synchronously (scheduleRestart runs `run` right away
    // here): maxAttempts + 1 exits is exactly the chain of restarts that first reaches the
    // policy's limit. That last exit also kicks off the periodic retry's own first attempt
    // (see "once bounded restarts are exhausted" below) instead of another bounded restart.
    for (let index = 0; index < policy.maxAttempts + 1; index += 1) {
      processes[index]?.exit(1);
    }

    expect(onRestartsExhausted).toHaveBeenCalledOnce();
    expect(fork).toHaveBeenCalledTimes(policy.maxAttempts + 2);
  });

  it("starts counting attempts afresh after the core has stayed up for a stable period", () => {
    const scheduleRestart = vi.fn((run: () => void) => {
      run();
      return () => {};
    });
    const onRestartsExhausted = vi.fn();
    const { supervisor, processes, advanceClock } = setUp({ scheduleRestart, onRestartsExhausted });

    supervisor.start();
    processes[0]?.exit(1);
    processes[1]?.exit(1);
    processes[2]?.exit(1);
    processes[3]?.becomeReady();
    advanceClock(policy.stableRunMs);
    processes[3]?.exit(1);

    expect(onRestartsExhausted).not.toHaveBeenCalled();
    expect(scheduleRestart).toHaveBeenLastCalledWith(expect.any(Function), policy.baseDelayMs);
  });

  it("never counts a core that never said it was ready as stable, however long it ran", () => {
    const onRestartsExhausted = vi.fn();
    const { supervisor, processes, advanceClock } = setUp({
      scheduleRestart: vi.fn((run: () => void) => {
        run();
        return () => {};
      }),
      onRestartsExhausted,
    });

    supervisor.start();
    for (let index = 0; index < policy.maxAttempts + 1; index += 1) {
      advanceClock(policy.stableRunMs);
      processes[index]?.exit(1);
    }

    expect(onRestartsExhausted).toHaveBeenCalledOnce();
  });

  it("keeps counting attempts when the core crashes again before a stable period", () => {
    const onRestartsExhausted = vi.fn();
    const { supervisor, processes, advanceClock } = setUp({
      scheduleRestart: vi.fn((run: () => void) => {
        run();
        return () => {};
      }),
      onRestartsExhausted,
    });

    supervisor.start();
    for (let index = 0; index < policy.maxAttempts + 1; index += 1) {
      advanceClock(policy.stableRunMs - 1);
      processes[index]?.exit(1);
    }

    expect(onRestartsExhausted).toHaveBeenCalledOnce();
  });

  it("calls onProcessStarted with every forked process, including restarts", () => {
    const onProcessStarted = vi.fn();
    const { supervisor, processes } = setUp({
      scheduleRestart: vi.fn((run: () => void) => {
        run();
        return () => {};
      }),
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
      scheduleRestart: vi.fn((run: () => void) => {
        run();
        return () => {};
      }),
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
      scheduleRestart: vi.fn((run: () => void) => {
        run();
        return () => {};
      }),
      onProcessExited,
    });

    supervisor.start();
    for (let index = 0; index < policy.maxAttempts + 1; index += 1) {
      processes[index]?.exit(1);
    }

    expect(onProcessExited).toHaveBeenLastCalledWith(processes[policy.maxAttempts]);
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
        return () => {};
      }),
    });

    supervisor.start();
    processes[0]?.exit(1);
    supervisor.stop();
    pendingRestart?.();

    expect(fork).toHaveBeenCalledOnce();
  });

  it("cancels the scheduled timer when stopped", () => {
    const cancel = vi.fn();
    const scheduleRestart = vi.fn(() => cancel);
    const { supervisor, processes } = setUp({ scheduleRestart });

    supervisor.start();
    processes[0]?.exit(1);
    supervisor.stop();

    expect(cancel).toHaveBeenCalledOnce();
  });

  describe("once bounded restarts are exhausted", () => {
    it("keeps retrying to start the core on the slow periodic interval instead of giving up", () => {
      const scheduleRestart = vi.fn((run: () => void) => {
        run();
        return () => {};
      });
      const { supervisor, processes, fork } = setUp({ scheduleRestart });

      supervisor.start();
      // maxAttempts + 1 exits is exactly the chain of bounded restarts that first reaches the
      // policy's limit; that last exit also kicks off the periodic retry's own first attempt.
      for (let index = 0; index < policy.maxAttempts + 1; index += 1) {
        processes[index]?.exit(1);
      }
      scheduleRestart.mockClear();
      processes.at(-1)?.exit(1);

      expect(scheduleRestart).toHaveBeenLastCalledWith(expect.any(Function), retryIntervalMs);
      expect(fork).toHaveBeenCalledTimes(policy.maxAttempts + 3);
    });

    it("reports the exhaustion fatal only once, not on every failed periodic retry", () => {
      const onRestartsExhausted = vi.fn();
      const { supervisor, processes } = setUp({
        scheduleRestart: vi.fn((run: () => void) => {
          run();
          return () => {};
        }),
        onRestartsExhausted,
      });

      supervisor.start();
      for (let index = 0; index < policy.maxAttempts + 1; index += 1) {
        processes[index]?.exit(1);
      }
      // The periodic retry's own core fails again, immediately, without ever being stable.
      processes.at(-1)?.exit(1);

      expect(onRestartsExhausted).toHaveBeenCalledOnce();
    });

    it("keeps the core down while a periodic retry has only started a process", () => {
      const onStatusChange = vi.fn();
      const { supervisor, processes } = setUp({
        scheduleRestart: vi.fn((run: () => void) => {
          run();
          return () => {};
        }),
        onStatusChange,
      });

      supervisor.start();
      for (let index = 0; index < policy.maxAttempts + 1; index += 1) {
        processes[index]?.exit(1);
      }

      expect(processes).toHaveLength(policy.maxAttempts + 2);
      expect(onStatusChange).toHaveBeenLastCalledWith("down");
      expect(onStatusChange).not.toHaveBeenCalledWith("up");
    });

    it("reports the core up once the periodic retry's process says it is ready", () => {
      const onStatusChange = vi.fn();
      const { supervisor, processes } = setUp({
        scheduleRestart: vi.fn((run: () => void) => {
          run();
          return () => {};
        }),
        onStatusChange,
      });

      supervisor.start();
      for (let index = 0; index < policy.maxAttempts + 1; index += 1) {
        processes[index]?.exit(1);
      }
      processes.at(-1)?.becomeReady();

      expect(onStatusChange).toHaveBeenLastCalledWith("up");
    });

    it("reports the core down again, without a new fatal, when a recovered core dies before it is stable", () => {
      const onStatusChange = vi.fn();
      const onRestartsExhausted = vi.fn();
      const { supervisor, processes, advanceClock } = setUp({
        scheduleRestart: vi.fn((run: () => void) => {
          run();
          return () => {};
        }),
        onStatusChange,
        onRestartsExhausted,
      });

      supervisor.start();
      for (let index = 0; index < policy.maxAttempts + 1; index += 1) {
        processes[index]?.exit(1);
      }
      processes.at(-1)?.becomeReady();
      advanceClock(policy.stableRunMs - 1);
      processes.at(-1)?.exit(1);

      expect(onStatusChange).toHaveBeenLastCalledWith("down");
      expect(onRestartsExhausted).toHaveBeenCalledOnce();
    });

    it("ignores a readiness message from a process that has already exited", () => {
      const onStatusChange = vi.fn();
      const { supervisor, processes } = setUp({
        scheduleRestart: vi.fn((run: () => void) => {
          run();
          return () => {};
        }),
        onStatusChange,
      });

      supervisor.start();
      for (let index = 0; index < policy.maxAttempts + 1; index += 1) {
        processes[index]?.exit(1);
      }
      processes[policy.maxAttempts]?.becomeReady();

      expect(onStatusChange).not.toHaveBeenCalledWith("up");
    });

    it("gives a core that recovers and stays stable fresh bounded restarts, firing a new fatal for its own later exhaustion", () => {
      const onRestartsExhausted = vi.fn();
      const { supervisor, processes, advanceClock } = setUp({
        scheduleRestart: vi.fn((run: () => void) => {
          run();
          return () => {};
        }),
        onRestartsExhausted,
      });

      supervisor.start();
      for (let index = 0; index < policy.maxAttempts + 1; index += 1) {
        processes[index]?.exit(1);
      }
      expect(onRestartsExhausted).toHaveBeenCalledOnce();

      const recoveredProcessIndex = processes.length - 1;
      processes[recoveredProcessIndex]?.becomeReady();
      advanceClock(policy.stableRunMs);
      processes[recoveredProcessIndex]?.exit(1);

      // A stable recovery resets the attempt count, so this new outage needs its own fresh,
      // full run of bounded restarts before it can exhaust again.
      for (let index = 0; index < policy.maxAttempts + 1; index += 1) {
        processes[recoveredProcessIndex + 1 + index]?.exit(1);
      }

      expect(onRestartsExhausted).toHaveBeenCalledTimes(2);
    });
  });

  describe("when a started core never says it is ready", () => {
    function withTimers(overrides: Partial<CoreSupervisorDeps> = {}) {
      vi.useFakeTimers();
      const scheduleOnTimer = (run: () => void, delayMs: number) => {
        const id = setTimeout(run, delayMs);
        return () => clearTimeout(id);
      };
      return setUp({
        scheduleRestart: vi.fn(scheduleOnTimer),
        scheduleReadinessDeadline: vi.fn(scheduleOnTimer),
        ...overrides,
      });
    }

    afterEach(() => {
      vi.useRealTimers();
    });

    it("kills a core that hangs on boot and restarts it like a crash", () => {
      const { supervisor, processes } = withTimers();

      supervisor.start();
      vi.advanceTimersByTime(readinessTimeoutMs);

      expect(processes[0]?.killed).toBe(true);
      vi.advanceTimersByTime(policy.baseDelayMs);
      expect(processes).toHaveLength(2);
    });

    it("counts the killed process's own later exit only once", () => {
      const { supervisor, processes } = withTimers();

      supervisor.start();
      vi.advanceTimersByTime(readinessTimeoutMs);
      processes[0]?.exit(null);
      vi.advanceTimersByTime(policy.maxDelayMs);

      expect(processes).toHaveLength(2);
    });

    it("exhausts the bounded restarts when every restarted core hangs, reporting the core down", () => {
      const onRestartsExhausted = vi.fn();
      const onStatusChange = vi.fn();
      const { supervisor, processes } = withTimers({ onRestartsExhausted, onStatusChange });

      supervisor.start();
      for (let index = 0; index < policy.maxAttempts + 1; index += 1) {
        vi.advanceTimersByTime(readinessTimeoutMs);
        processes[index]?.exit(null);
        vi.advanceTimersByTime(policy.maxDelayMs);
      }

      expect(onRestartsExhausted).toHaveBeenCalledOnce();
      expect(onStatusChange).toHaveBeenLastCalledWith("down");
      expect(processes.slice(0, policy.maxAttempts + 1).every((process) => process.killed)).toBe(
        true,
      );
    });

    it("keeps retrying periodically, without a new fatal, when a periodic retry's core hangs", () => {
      const onRestartsExhausted = vi.fn();
      const onStatusChange = vi.fn();
      const { supervisor, processes } = withTimers({ onRestartsExhausted, onStatusChange });

      supervisor.start();
      for (let index = 0; index < policy.maxAttempts + 1; index += 1) {
        processes[index]?.exit(1);
        vi.advanceTimersByTime(policy.maxDelayMs);
      }
      vi.advanceTimersByTime(retryIntervalMs);
      const retried = processes.length;
      vi.advanceTimersByTime(readinessTimeoutMs);
      vi.advanceTimersByTime(retryIntervalMs);

      expect(processes.at(retried - 1)?.killed).toBe(true);
      expect(processes).toHaveLength(retried + 1);
      expect(onRestartsExhausted).toHaveBeenCalledOnce();
      expect(onStatusChange).toHaveBeenLastCalledWith("down");
    });

    it("never kills a core that said it was ready in time", () => {
      const { supervisor, processes } = withTimers();

      supervisor.start();
      vi.advanceTimersByTime(readinessTimeoutMs - 1);
      processes[0]?.becomeReady();
      vi.advanceTimersByTime(readinessTimeoutMs);

      expect(processes[0]?.killed).toBe(false);
      expect(processes).toHaveLength(1);
    });

    it("clears the readiness deadline when the core exits before it", () => {
      const { supervisor, processes } = withTimers();

      supervisor.start();
      processes[0]?.exit(1);
      vi.advanceTimersByTime(policy.baseDelayMs);

      // Only the restarted process's own deadline is left.
      expect(vi.getTimerCount()).toBe(1);
      expect(processes[0]?.killed).toBe(false);
    });

    it("clears the readiness deadline when stopped", () => {
      const { supervisor, processes } = withTimers();

      supervisor.start();
      supervisor.stop();

      expect(vi.getTimerCount()).toBe(0);
      expect(processes).toHaveLength(1);
    });
  });
});
