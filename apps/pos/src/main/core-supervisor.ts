import { isCoreReadyMessage } from "./core-readiness";
import type { CoreStatus } from "./core-status-broadcast";

export interface RestartPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  // A crash after the core has been ready this long starts counting attempts from zero again.
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
  on(event: "message", listener: (message: unknown) => void): void;
  kill(): void;
}

export interface CoreSupervisorDeps {
  fork(): SupervisedProcess;
  // Returns a canceler so stop() can clear a pending timer instead of leaving it on the event
  // loop for the rest of retryIntervalMs after quit (harmless, but keeps the process alive).
  scheduleRestart(run: () => void, delayMs: number): () => void;
  now(): number;
  policy: RestartPolicy;
  // Delay between start attempts once bounded restarts are exhausted; the core retries forever,
  // unlike the renderer's own reload recovery, which still gives up for good.
  retryIntervalMs: number;
  scheduleReadinessDeadline(run: () => void, delayMs: number): () => void;
  // A started core that hasn't said it is ready within this long is killed and counted as a crash.
  readinessTimeoutMs: number;
  onProcessStarted?(process: SupervisedProcess): void;
  onProcessExited?(process: SupervisedProcess): void;
  // Fires once per outage: failed periodic retries never report again until a recovered core has
  // stayed ready for stableRunMs.
  onRestartsExhausted?(): void;
  // "up" only once the process has said it is ready; "down" from bounded restarts running out
  // until a retry's process is ready; "starting" otherwise.
  onStatusChange?(status: CoreStatus): void;
}

export interface CoreSupervisor {
  start(): void;
  stop(): void;
}

// Any exit not requested through stop() is a crash, whatever its exit code.
export function createCoreSupervisor(deps: CoreSupervisorDeps): CoreSupervisor {
  let attempt = 0;
  let stopped = true;
  let current: SupervisedProcess | undefined;
  let outageOpen = false;
  let status: CoreStatus = "starting";
  let cancelScheduled: (() => void) | undefined;
  let cancelReadinessDeadline: (() => void) | undefined;

  function schedule(run: () => void, delayMs: number): void {
    cancelScheduled = deps.scheduleRestart(run, delayMs);
  }

  function setStatus(next: CoreStatus): void {
    if (next === status) {
      return;
    }
    status = next;
    deps.onStatusChange?.(next);
  }

  function launch(): void {
    if (stopped) {
      return;
    }
    cancelScheduled = undefined;

    const process = deps.fork();
    let readyAt: number | undefined;
    // Set when the deadline kills this process, so a late "ready" message from it never
    // resurrects the status after teardown has started.
    let missedReadinessDeadline = false;
    current = process;
    deps.onProcessStarted?.(process);

    const cancelDeadline = deps.scheduleReadinessDeadline(() => {
      if (stopped) {
        return;
      }
      missedReadinessDeadline = true;
      // Kill only, don't fork a replacement: two cores could fight over the database or hardware.
      // Windows (the only shipped target) makes kill() terminate outright, so this won't hang.
      process.kill();
    }, deps.readinessTimeoutMs);
    cancelReadinessDeadline = cancelDeadline;

    process.on("message", (message) => {
      if (stopped || current !== process || readyAt !== undefined || missedReadinessDeadline) {
        return;
      }
      if (isCoreReadyMessage(message)) {
        cancelDeadline();
        readyAt = deps.now();
        setStatus("up");
      }
    });

    process.once("exit", () => {
      if (current === process) {
        current = undefined;
      }
      deps.onProcessExited?.(process);
      handleCrash();
    });

    function handleCrash(): void {
      cancelDeadline();
      if (current === process) {
        current = undefined;
      }
      if (stopped) {
        return;
      }

      if (readyAt !== undefined && deps.now() - readyAt >= deps.policy.stableRunMs) {
        attempt = 0;
        outageOpen = false;
      }

      const decision = decideRestart(attempt, deps.policy);
      attempt += 1;

      if (decision.shouldRestart) {
        if (status === "up") {
          setStatus("starting");
        }
        schedule(launch, decision.delayMs);
        return;
      }

      if (!outageOpen) {
        outageOpen = true;
        deps.onRestartsExhausted?.();
      }
      setStatus("down");
      schedule(launch, deps.retryIntervalMs);
    }
  }

  return {
    start(): void {
      stopped = false;
      attempt = 0;
      outageOpen = false;
      status = "starting";
      launch();
    },
    stop(): void {
      stopped = true;
      cancelScheduled?.();
      cancelScheduled = undefined;
      cancelReadinessDeadline?.();
      cancelReadinessDeadline = undefined;
      current?.kill();
    },
  };
}
