import { onTestFinished, vi } from "vitest";
import { defaultReleaseMonitor, type ReleaseMonitor } from "../release-monitor";

export function fakeReleaseMonitor(outdated: boolean): ReleaseMonitor {
  return {
    outdated: () => outdated,
    check: () => Promise.resolve(),
    observe: () => {},
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
      observe: () => {},
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

export const OUTDATED_TAB_ADVICE = "Se actualizó el backoffice: recargá la página para seguir.";

export function openAsOutdatedTab(): void {
  const outdated = vi.spyOn(defaultReleaseMonitor, "outdated").mockReturnValue(true);
  onTestFinished(() => outdated.mockRestore());
}
