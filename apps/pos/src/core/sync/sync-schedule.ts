export type SyncResult = { kind: "succeeded" } | { kind: "failed"; retryAfterMs?: number };

export interface SyncScheduleDeps {
  syncOnce: () => Promise<SyncResult>;
  intervalMs: number;
  failureBackoff: { baseMs: number; maxMs: number };
  random: () => number;
  scheduleNext: (run: () => void, delayMs: number) => () => void;
  onFailure: (error: unknown) => void;
  afterEachSync: () => void;
}

export interface SyncSchedule {
  start(): void;
  syncNow(): void;
}

export function createSyncSchedule(deps: SyncScheduleDeps): SyncSchedule {
  let running = false;
  let askedWhileRunning = false;
  let waitingForCloud = false;
  let consecutiveFailures = 0;
  let cancelNext: (() => void) | undefined;

  function retryDelayMs(): number {
    const { baseMs, maxMs } = deps.failureBackoff;
    const ceiling = Math.min(maxMs, baseMs * 2 ** (consecutiveFailures - 1));
    return ceiling / 2 + (deps.random() * ceiling) / 2;
  }

  async function runOnce(): Promise<SyncResult> {
    try {
      return await deps.syncOnce();
    } catch (error) {
      deps.onFailure(error);
      return { kind: "failed" };
    }
  }

  async function sync(): Promise<void> {
    cancelNext?.();
    cancelNext = undefined;
    if (running) {
      askedWhileRunning = true;
      return;
    }
    running = true;
    waitingForCloud = false;
    const result = await runOnce();
    running = false;
    deps.afterEachSync();

    let delayMs = deps.intervalMs;
    if (result.kind === "succeeded") {
      consecutiveFailures = 0;
    } else {
      consecutiveFailures += 1;
      waitingForCloud = result.retryAfterMs !== undefined;
      delayMs = result.retryAfterMs ?? retryDelayMs();
    }
    if (askedWhileRunning) {
      askedWhileRunning = false;
      if (!waitingForCloud) {
        await sync();
        return;
      }
    }
    cancelNext = deps.scheduleNext(() => void sync(), delayMs);
  }

  return {
    start: () => void sync(),
    syncNow: () => {
      if (!waitingForCloud) {
        void sync();
      }
    },
  };
}
