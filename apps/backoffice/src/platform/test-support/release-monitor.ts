import type { ReleaseMonitor } from "../release-monitor";

export function fakeReleaseMonitor(outdated: boolean): ReleaseMonitor {
  return {
    outdated: () => outdated,
    check: () => Promise.resolve(),
    subscribe: () => () => {},
  };
}
