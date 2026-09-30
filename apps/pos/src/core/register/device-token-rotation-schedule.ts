const CHECK_INTERVAL_MS = 15 * 60 * 1000;

interface DeviceTokenRotationScheduleDeps {
  rotate: () => Promise<unknown>;
  schedule: (run: () => Promise<void>, delayMs: number) => () => void;
}

export function startDeviceTokenRotationSchedule(
  deps: DeviceTokenRotationScheduleDeps,
): () => void {
  let stopped = false;
  let cancelPending: () => void = () => undefined;

  function scheduleCheck(delayMs: number): void {
    cancelPending = deps.schedule(async () => {
      await deps.rotate().catch(() => undefined);
      if (!stopped) {
        scheduleCheck(CHECK_INTERVAL_MS);
      }
    }, delayMs);
  }

  scheduleCheck(0);
  return () => {
    stopped = true;
    cancelPending();
  };
}
