import type { MainToCoreMessage } from "@purosur/contracts";
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

export interface SnapshotWorkerProcess extends CoreProcessOutput {
  once(event: "exit", listener: (code: number | null) => void): void;
  postMessage(message: unknown): void;
  kill(): void;
}

export interface SnapshotWorkerLauncherDeps {
  fork(): SnapshotWorkerProcess;
  startTimer(run: () => void, delayMs: number): () => void;
  notifyCore(notice: Extract<MainToCoreMessage, { type: "snapshot-worker-exited" }>): void;
}

export interface SnapshotWorkerLauncher {
  handleCoreMessage(message: unknown): void;
  stop(): void;
}

const EXITED = { type: "snapshot-worker-exited" } as const;

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
      deps.notifyCore(EXITED);
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
