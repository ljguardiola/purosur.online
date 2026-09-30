export type PullResult = { kind: "succeeded" } | { kind: "failed"; retryAfterMs?: number };

export interface PullScheduleDeps {
  pullOnce: () => Promise<PullResult>;
  intervalMs: number;
  failureBackoff: { baseMs: number; maxMs: number };
  random: () => number;
  scheduleNext: (run: () => void, delayMs: number) => () => void;
  onFailure: (error: unknown) => void;
  afterEachPull: () => void;
}

export interface PullSchedule {
  start(): void;
  pullNow(): void;
}

export function createPullSchedule(deps: PullScheduleDeps): PullSchedule {
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

  async function runOnce(): Promise<PullResult> {
    try {
      return await deps.pullOnce();
    } catch (error) {
      deps.onFailure(error);
      return { kind: "failed" };
    }
  }

  async function pull(): Promise<void> {
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
    deps.afterEachPull();

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
        await pull();
        return;
      }
    }
    cancelNext = deps.scheduleNext(() => void pull(), delayMs);
  }

  return {
    start: () => void pull(),
    pullNow: () => {
      if (!waitingForCloud) {
        void pull();
      }
    },
  };
}
