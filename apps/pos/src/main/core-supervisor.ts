export interface RestartPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export interface RestartDecision {
  shouldRestart: boolean;
  delayMs: number;
}

export function decideRestart(attempt: number, policy: RestartPolicy): RestartDecision {
  if (attempt >= policy.maxAttempts) {
    return { shouldRestart: false, delayMs: 0 };
  }

  return {
    shouldRestart: true,
    delayMs: Math.min(policy.baseDelayMs * 2 ** attempt, policy.maxDelayMs),
  };
}

export interface SupervisedProcess {
  once(event: "exit", listener: (code: number | null) => void): void;
}

export interface CoreSupervisorDeps {
  fork(): SupervisedProcess;
  scheduleRestart(run: () => void, delayMs: number): void;
  policy: RestartPolicy;
  onRestartsExhausted?(): void;
}

export interface CoreSupervisor {
  start(): void;
  stop(): void;
}

// Restarted only on an unexpected exit: main holds no business logic, but it still has to keep
// the core process alive across a crash, with backoff instead of a hot restart loop.
export function createCoreSupervisor(deps: CoreSupervisorDeps): CoreSupervisor {
  let attempt = 0;
  let stopped = true;

  function launch(): void {
    const process = deps.fork();
    process.once("exit", (code) => {
      if (stopped) {
        return;
      }

      if (code === 0) {
        attempt = 0;
        return;
      }

      const decision = decideRestart(attempt, deps.policy);
      attempt += 1;

      if (decision.shouldRestart) {
        deps.scheduleRestart(launch, decision.delayMs);
      } else {
        deps.onRestartsExhausted?.();
      }
    });
  }

  return {
    start(): void {
      stopped = false;
      attempt = 0;
      launch();
    },
    stop(): void {
      stopped = true;
    },
  };
}
