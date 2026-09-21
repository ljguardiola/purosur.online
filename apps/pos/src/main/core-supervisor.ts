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
  // Returns a canceler so a supervisor stop() can clear a still-pending timer instead of leaving
  // it to fire into a stopped supervisor (harmless, since launch() bails out, but a periodic
  // retry can otherwise sit on the event loop for the whole retryIntervalMs after quit).
  scheduleRestart(run: () => void, delayMs: number): () => void;
  now(): number;
  policy: RestartPolicy;
  // Delay between core start attempts once bounded restarts are exhausted. Kept separate from
  // RestartPolicy, which is also shared with the renderer's own reload recovery: that recovery
  // still gives up for good, only the core keeps retrying forever.
  retryIntervalMs: number;
  onProcessStarted?(process: SupervisedProcess): void;
  onProcessExited?(process: SupervisedProcess): void;
  onRestartsExhausted?(): void;
  // Fires once a periodic retry starts the core again after restarts were exhausted, taking that
  // start itself as "brought back" — the same signal the rest of this module already treats as
  // "the core is live" (e.g. main's onProcessStarted reconnects the renderer without waiting to
  // see whether the process stays up). Whether that outage is over for onRestartsExhausted's own
  // once-per-outage bookkeeping is a separate, stricter question: see `outageOpen` below.
  onRecovered?(): void;
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
  // True from the moment bounded restarts are first exhausted until the core proves stable
  // again (the same stableRunMs window that resets `attempt` below): guards onRestartsExhausted
  // so a periodic retry that keeps failing without ever becoming stable never fires a second
  // fatal for what is still the same outage.
  let outageOpen = false;
  // True while onRestartsExhausted has fired and onRecovered hasn't caught up yet: cleared (and
  // onRecovered called) the moment the core starts again, so the renderer's notice can drop as
  // soon as a retry takes, without waiting the much longer stableRunMs it takes to close the
  // outage itself.
  let noticeVisible = false;
  let cancelScheduled: (() => void) | undefined;

  function schedule(run: () => void, delayMs: number): void {
    cancelScheduled = deps.scheduleRestart(run, delayMs);
  }

  function launch(): void {
    if (stopped) {
      return;
    }
    cancelScheduled = undefined;

    const process = deps.fork();
    const startedAt = deps.now();
    current = process;
    deps.onProcessStarted?.(process);
    if (noticeVisible) {
      noticeVisible = false;
      deps.onRecovered?.();
    }

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
        outageOpen = false;
      }

      const decision = decideRestart(attempt, deps.policy);
      attempt += 1;

      if (decision.shouldRestart) {
        schedule(launch, decision.delayMs);
        return;
      }

      if (!outageOpen) {
        outageOpen = true;
        noticeVisible = true;
        deps.onRestartsExhausted?.();
      }
      schedule(launch, deps.retryIntervalMs);
    });
  }

  return {
    start(): void {
      stopped = false;
      attempt = 0;
      outageOpen = false;
      noticeVisible = false;
      launch();
    },
    stop(): void {
      stopped = true;
      cancelScheduled?.();
      cancelScheduled = undefined;
      current?.kill();
    },
  };
}
