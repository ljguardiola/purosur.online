export interface RestartPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  // A crash after the core has stayed up this long starts counting attempts from zero again.
  stableRunMs: number;
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
  kill(): void;
}

export interface CoreSupervisorDeps {
  fork(): SupervisedProcess;
  scheduleRestart(run: () => void, delayMs: number): void;
  now(): number;
  policy: RestartPolicy;
  onProcessStarted?(process: SupervisedProcess): void;
  onProcessExited?(process: SupervisedProcess): void;
  onRestartsExhausted?(): void;
}

export interface CoreSupervisor {
  start(): void;
  stop(): void;
}

// Any exit main didn't ask for through stop() is a crash, whatever its exit code: main holds no
// business logic, but it still has to keep the core process alive, with backoff instead of a hot
// restart loop.
export function createCoreSupervisor(deps: CoreSupervisorDeps): CoreSupervisor {
  let attempt = 0;
  let stopped = true;
  let current: SupervisedProcess | undefined;

  function launch(): void {
    if (stopped) {
      return;
    }

    const process = deps.fork();
    const startedAt = deps.now();
    current = process;
    deps.onProcessStarted?.(process);
    process.once("exit", () => {
      if (current === process) {
        current = undefined;
      }
      deps.onProcessExited?.(process);
      if (stopped) {
        return;
      }

      if (deps.now() - startedAt >= deps.policy.stableRunMs) {
        attempt = 0;
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
      current?.kill();
    },
  };
}
