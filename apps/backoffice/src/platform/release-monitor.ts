import { createContext, useContext, useSyncExternalStore } from "react";
import { readDeployedRelease } from "./deployed-release-api";

export type ReleaseMonitor = {
  outdated: () => boolean;
  check: () => Promise<void>;
  subscribe: (listener: () => void) => () => void;
};

type ReleaseMonitorOptions = {
  running: string;
  readDeployedRelease: () => Promise<string | undefined>;
};

export function createReleaseMonitor({
  running,
  readDeployedRelease: read,
}: ReleaseMonitorOptions): ReleaseMonitor {
  const listeners = new Set<() => void>();
  let isOutdated = false;
  let reading: Promise<void> | undefined;

  function check(): Promise<void> {
    if (running === "" || isOutdated) {
      return Promise.resolve();
    }
    reading ??= read()
      .catch(() => undefined)
      .then((deployed) => {
        if (deployed !== undefined && deployed !== running) {
          isOutdated = true;
          for (const listener of listeners) {
            listener();
          }
        }
      })
      .finally(() => {
        reading = undefined;
      });
    return reading;
  }

  return {
    outdated: () => isOutdated,
    check,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const defaultReleaseMonitor = createReleaseMonitor({
  running: __BACKOFFICE_RELEASE__,
  readDeployedRelease,
});

export const ReleaseMonitorContext = createContext<ReleaseMonitor>(defaultReleaseMonitor);

export function useReleaseOutdated(): boolean {
  const monitor = useContext(ReleaseMonitorContext);
  return useSyncExternalStore(monitor.subscribe, monitor.outdated);
}
