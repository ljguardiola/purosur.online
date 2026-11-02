import { useEffect } from "react";
import type { ReleaseMonitor } from "../platform/release-monitor";

const DEFAULT_INTERVAL_MS = 300_000;

export function useReleaseWatcher({
  monitor,
  intervalMs = DEFAULT_INTERVAL_MS,
}: {
  monitor: ReleaseMonitor;
  intervalMs?: number;
}): void {
  useEffect(() => {
    function check() {
      // Every tab shares the cloud's request budget: a hidden tab stays quiet.
      if (monitor.outdated() || document.visibilityState !== "visible") {
        return;
      }
      void monitor.check();
    }

    check();
    const intervalId = window.setInterval(check, intervalMs);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", check);
    };
  }, [monitor, intervalMs]);
}
