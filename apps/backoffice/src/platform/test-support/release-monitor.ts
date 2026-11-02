import type { ReleaseMonitor } from "../release-monitor";

export function fakeReleaseMonitor(outdated: boolean): ReleaseMonitor {
  return {
    outdated: () => outdated,
    check: () => Promise.resolve(),
    subscribe: () => () => {},
  };
}

export function releaseMonitorThatTurnsOutdated(): {
  monitor: ReleaseMonitor;
  turnOutdated: () => void;
} {
  const listeners = new Set<() => void>();
  let outdated = false;
  return {
    monitor: {
      outdated: () => outdated,
      check: () => Promise.resolve(),
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    turnOutdated() {
      outdated = true;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}
