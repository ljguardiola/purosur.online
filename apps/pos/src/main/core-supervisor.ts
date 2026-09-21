import { isCoreReadyMessage } from "../shared/core-readiness";
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
  // Only read by deps.forceKill, which needs it to send SIGKILL directly (kill() itself only ever
  // sends SIGTERM).
  pid: number | undefined;
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
  scheduleReadinessDeadline(run: () => void, delayMs: number): () => void;
  // A started core that hasn't said it is ready within this long is killed and counted as a crash.
  readinessTimeoutMs: number;
  scheduleForceKill(run: () => void, delayMs: number): () => void;
  // SIGTERM (kill()) is not guaranteed to end a process: a dependency could install a handler, or
  // it could be stuck in uninterruptible I/O. A process killed for missing its readiness deadline
  // that hasn't exited within this long is force-killed instead.
  killGraceMs: number;
  forceKill(process: SupervisedProcess): void;
  onProcessStarted?(process: SupervisedProcess): void;
  onProcessExited?(process: SupervisedProcess): void;
  // Fires once per outage: failed periodic retries never report again until a recovered core has
  // stayed ready for stableRunMs.
  onRestartsExhausted?(): void;
  // "up" only once the running process has said it is ready; "down" from the moment bounded
  // restarts run out until a periodic retry's process is ready; "starting" otherwise.
  onStatusChange?(status: CoreStatus): void;
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
  let outageOpen = false;
  let status: CoreStatus = "starting";
  let cancelScheduled: (() => void) | undefined;
  let cancelReadinessDeadline: (() => void) | undefined;
  let cancelForceKill: (() => void) | undefined;

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
    // Set the moment the readiness deadline kills this process, so its message handler never
    // reports a late "ready" up: the process is already being torn down.
    let missedReadinessDeadline = false;
    current = process;
    deps.onProcessStarted?.(process);

    const cancelDeadline = deps.scheduleReadinessDeadline(() => {
      if (stopped) {
        return;
      }
      missedReadinessDeadline = true;
      // Forking a replacement before this process's own exit is observed could run two cores at
      // once if it ignores the kill signal for a while, fighting over the database or hardware;
      // the exit handler below drives the normal crash path instead. If it's still not gone after
      // killGraceMs, escalate to a force-kill rather than wait forever — but never escalate past
      // that: if even a force-kill doesn't end it (stuck in uninterruptible I/O), no amount of
      // retrying from here can fix a process wedged in the kernel, and forking a second core while
      // this one might still be alive is exactly the failure this whole path exists to prevent.
      process.kill();
      cancelForceKill = deps.scheduleForceKill(() => {
        cancelForceKill = undefined;
        deps.forceKill(process);
      }, deps.killGraceMs);
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
      cancelForceKill?.();
      cancelForceKill = undefined;
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
      cancelForceKill?.();
      cancelForceKill = undefined;
      current?.kill();
    },
  };
}
