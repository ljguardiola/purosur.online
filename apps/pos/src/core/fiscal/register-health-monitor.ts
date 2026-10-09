import { REGISTER_HEALTH_CHECK_INTERVAL_MS } from "@purosur/domain";

export interface RegisterHealthMonitorDeps {
  check: () => Promise<unknown>;
  scheduleNext: (run: () => void, delayMs: number) => () => void;
  onFailure: (error: unknown) => void;
}

export function startRegisterHealthMonitor({
  check,
  scheduleNext,
  onFailure,
}: RegisterHealthMonitorDeps): () => void {
  let stopped = false;
  let cancelPending: () => void = () => undefined;

  function schedule(delayMs: number): void {
    cancelPending = scheduleNext(() => {
      void checkThenSchedule();
    }, delayMs);
  }

  async function checkThenSchedule(): Promise<void> {
    try {
      await check();
    } catch (error) {
      onFailure(error);
    }
    if (!stopped) {
      schedule(REGISTER_HEALTH_CHECK_INTERVAL_MS);
    }
  }

  schedule(0);
  return () => {
    stopped = true;
    cancelPending();
  };
}
