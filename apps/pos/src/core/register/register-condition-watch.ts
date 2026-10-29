export interface RegisterConditionWatchDeps {
  observe: () => void;
  intervalMs: number;
  scheduleNext: (run: () => void, delayMs: number) => void;
  onFailure: (error: unknown) => void;
}

export interface RegisterConditionWatch {
  start(): void;
}

export function createRegisterConditionWatch(
  deps: RegisterConditionWatchDeps,
): RegisterConditionWatch {
  function observeOnce(): void {
    try {
      deps.observe();
    } catch (error) {
      deps.onFailure(error);
    }
    deps.scheduleNext(observeOnce, deps.intervalMs);
  }

  return { start: observeOnce };
}
