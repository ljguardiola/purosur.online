import type { CoreProcessOutput } from "./core-output";

// Main may import only types from packages/contracts, so it reads the core's request with no
// library; the worker validates the job itself.

export interface SnapshotWorkerLaunch {
  timeLimitMs: number;
  job: object;
}

export function readSnapshotWorkerLaunch(message: unknown): SnapshotWorkerLaunch | undefined {
  if (typeof message !== "object" || message === null) {
    return undefined;
  }
  const { type, time_limit_ms: timeLimitMs, job } = message as Record<string, unknown>;
  if (
    type !== "launch-snapshot-worker" ||
    typeof timeLimitMs !== "number" ||
    !Number.isInteger(timeLimitMs) ||
    timeLimitMs <= 0 ||
    typeof job !== "object" ||
    job === null ||
    Array.isArray(job)
  ) {
    return undefined;
  }
  return { timeLimitMs, job };
}

const RESTORE_OUTCOMES: ReadonlySet<string> = new Set([
  "restored",
  "no_generation",
  "none_usable",
  "unreachable",
]);

function readSnapshotCopyFailure(message: unknown): string | undefined {
  if (typeof message !== "object" || message === null) {
    return undefined;
  }
  const { type, stage } = message as Record<string, unknown>;
  return type === "snapshot-copy-failed" && typeof stage === "string" ? stage : undefined;
}

function readAnnouncedKeyVersion(message: unknown): number | undefined {
  if (typeof message !== "object" || message === null) {
    return undefined;
  }
  const { type, version } = message as Record<string, unknown>;
  return type === "snapshot-key-version-announced" &&
    typeof version === "number" &&
    Number.isInteger(version) &&
    version > 0
    ? version
    : undefined;
}

function readRestoreOutcome(message: unknown): string | undefined {
  if (typeof message !== "object" || message === null) {
    return undefined;
  }
  const { type, outcome } = message as Record<string, unknown>;
  return type === "snapshot-restore-finished" &&
    typeof outcome === "string" &&
    RESTORE_OUTCOMES.has(outcome)
    ? outcome
    : undefined;
}

interface SnapshotWorkerExitedNotice {
  type: "snapshot-worker-exited";
  copy_failed_stage?: string;
  latest_announced_key_version?: number;
  restore_outcome?: string;
}

export interface SnapshotWorkerProcess extends CoreProcessOutput {
  once(event: "exit", listener: (code: number | null) => void): void;
  on(event: "message", listener: (message: unknown) => void): void;
  postMessage(message: unknown): void;
  kill(): void;
}

export interface SnapshotWorkerLauncherDeps {
  fork(): SnapshotWorkerProcess;
  startTimer(run: () => void, delayMs: number): () => void;
  notifyCore(notice: SnapshotWorkerExitedNotice): void;
}

export interface SnapshotWorkerLauncher {
  handleCoreMessage(message: unknown): void;
  stop(): void;
}

const EXITED: SnapshotWorkerExitedNotice = { type: "snapshot-worker-exited" };

export function createSnapshotWorkerLauncher(
  deps: SnapshotWorkerLauncherDeps,
): SnapshotWorkerLauncher {
  let running: SnapshotWorkerProcess | undefined;

  function launch({ timeLimitMs, job }: SnapshotWorkerLaunch): void {
    let worker: SnapshotWorkerProcess;
    try {
      worker = deps.fork();
    } catch {
      deps.notifyCore(EXITED);
      return;
    }
    running = worker;
    let copyFailedStage: string | undefined;
    let announcedKeyVersion: number | undefined;
    let restoreOutcome: string | undefined;
    worker.on("message", (message) => {
      const stage = readSnapshotCopyFailure(message);
      if (stage !== undefined) {
        copyFailedStage = stage;
        worker.kill();
        return;
      }
      const version = readAnnouncedKeyVersion(message);
      if (version !== undefined) {
        announcedKeyVersion = version;
        worker.kill();
        return;
      }
      const outcome = readRestoreOutcome(message);
      if (outcome !== undefined) {
        restoreOutcome = outcome;
        worker.kill();
      }
    });
    const cancelTimer = deps.startTimer(() => {
      if (running === worker) {
        worker.kill();
      }
    }, timeLimitMs);
    worker.once("exit", () => {
      cancelTimer();
      if (running === worker) {
        running = undefined;
      }
      deps.notifyCore({
        ...EXITED,
        ...(copyFailedStage === undefined ? {} : { copy_failed_stage: copyFailedStage }),
        ...(announcedKeyVersion === undefined
          ? {}
          : { latest_announced_key_version: announcedKeyVersion }),
        ...(restoreOutcome === undefined ? {} : { restore_outcome: restoreOutcome }),
      });
    });
    worker.postMessage(job);
  }

  return {
    handleCoreMessage(message) {
      const request = readSnapshotWorkerLaunch(message);
      if (request !== undefined && running === undefined) {
        launch(request);
      }
    },
    stop() {
      running?.kill();
    },
  };
}
