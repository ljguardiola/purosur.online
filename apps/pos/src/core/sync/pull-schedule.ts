export interface PullScheduleDeps {
  pullOnce: () => Promise<void>;
  intervalMs: number;
  scheduleNext: (run: () => void, delayMs: number) => () => void;
  onFailure: (error: unknown) => void;
}

export interface PullSchedule {
  start(): void;
  pullNow(): void;
}

export function createPullSchedule(deps: PullScheduleDeps): PullSchedule {
  let running = false;
  let askedWhileRunning = false;
  let cancelNext: (() => void) | undefined;

  async function pull(): Promise<void> {
    cancelNext?.();
    cancelNext = undefined;
    if (running) {
      askedWhileRunning = true;
      return;
    }
    running = true;
    try {
      await deps.pullOnce();
    } catch (error) {
      deps.onFailure(error);
    } finally {
      running = false;
    }
    if (askedWhileRunning) {
      askedWhileRunning = false;
      await pull();
      return;
    }
    cancelNext = deps.scheduleNext(() => void pull(), deps.intervalMs);
  }

  return {
    start: () => void pull(),
    pullNow: () => void pull(),
  };
}
