import { describe, expect, it, vi } from "vitest";
import { createCoreSupervisor, decideRestart, type SupervisedProcess } from "./core-supervisor";

const policy = { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1000 };

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
  private exitListener: ((code: number | null) => void) | undefined;

  once(_event: "exit", listener: (code: number | null) => void): void {
    this.exitListener = listener;
  }

  exit(code: number | null): void {
    this.exitListener?.(code);
  }
}

describe("createCoreSupervisor", () => {
  it("forks the core process once on start", () => {
    const processes: FakeProcess[] = [];
    const fork = vi.fn(() => {
      const process = new FakeProcess();
      processes.push(process);
      return process;
    });
    const supervisor = createCoreSupervisor({ fork, scheduleRestart: vi.fn(), policy });

    supervisor.start();

    expect(fork).toHaveBeenCalledOnce();
  });

  it("schedules a restart with backoff after an unexpected exit", () => {
    const processes: FakeProcess[] = [];
    const fork = vi.fn(() => {
      const process = new FakeProcess();
      processes.push(process);
      return process;
    });
    const scheduleRestart = vi.fn();
    const supervisor = createCoreSupervisor({ fork, scheduleRestart, policy });

    supervisor.start();
    processes[0]?.exit(1);

    expect(scheduleRestart).toHaveBeenCalledExactlyOnceWith(expect.any(Function), 100);
  });

  it("forks again once the scheduled restart runs", () => {
    const processes: FakeProcess[] = [];
    const fork = vi.fn(() => {
      const process = new FakeProcess();
      processes.push(process);
      return process;
    });
    const scheduleRestart = vi.fn((run: () => void) => run());
    const supervisor = createCoreSupervisor({ fork, scheduleRestart, policy });

    supervisor.start();
    processes[0]?.exit(1);

    expect(fork).toHaveBeenCalledTimes(2);
  });

  it("does not schedule a restart after a clean exit", () => {
    const processes: FakeProcess[] = [];
    const fork = vi.fn(() => {
      const process = new FakeProcess();
      processes.push(process);
      return process;
    });
    const scheduleRestart = vi.fn();
    const supervisor = createCoreSupervisor({ fork, scheduleRestart, policy });

    supervisor.start();
    processes[0]?.exit(0);

    expect(scheduleRestart).not.toHaveBeenCalled();
  });

  it("reports exhaustion once the attempt limit is reached instead of scheduling forever", () => {
    const processes: FakeProcess[] = [];
    const fork = vi.fn(() => {
      const process = new FakeProcess();
      processes.push(process);
      return process;
    });
    const scheduleRestart = vi.fn((run: () => void) => run());
    const onRestartsExhausted = vi.fn();
    const supervisor = createCoreSupervisor({
      fork,
      scheduleRestart,
      policy,
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

  it("stop() prevents a restart from being scheduled for a later exit", () => {
    const processes: FakeProcess[] = [];
    const fork = vi.fn(() => {
      const process = new FakeProcess();
      processes.push(process);
      return process;
    });
    const scheduleRestart = vi.fn();
    const supervisor = createCoreSupervisor({ fork, scheduleRestart, policy });

    supervisor.start();
    supervisor.stop();
    processes[0]?.exit(1);

    expect(scheduleRestart).not.toHaveBeenCalled();
  });
});
