import { afterEach, expect, test, vi } from "vitest";
import { renderHook } from "vitest-browser-react";
import type { ReleaseMonitor } from "../platform/release-monitor";
import { useReleaseWatcher } from "./release-watcher";
import { setVisibilityState, usingFakeTimers } from "./test-support/page-timing";

function createMonitor() {
  let outdated = false;
  const monitor: ReleaseMonitor = {
    outdated: () => outdated,
    check: vi.fn(() => Promise.resolve()),
    observe: () => {},
    subscribe: () => () => {},
  };
  return {
    monitor,
    becomeOutdated: () => {
      outdated = true;
    },
  };
}

let hooks: Array<{ unmount: () => Promise<void> }> = [];
let restoreVisibility = () => {};

afterEach(async () => {
  for (const hook of hooks) {
    await hook.unmount();
  }
  hooks = [];
  restoreVisibility();
  restoreVisibility = () => {};
});

async function watch(monitor: ReleaseMonitor, intervalMs = 10_000) {
  const hook = await renderHook(() => useReleaseWatcher({ monitor, intervalMs }));
  hooks.push(hook);
  return hook;
}

test("checks the deployed release right away", async () => {
  await usingFakeTimers(async () => {
    const { monitor } = createMonitor();

    await watch(monitor);

    expect(monitor.check).toHaveBeenCalledTimes(1);
  });
});

test("checks again every interval while the tab is visible", async () => {
  await usingFakeTimers(async () => {
    const { monitor } = createMonitor();
    await watch(monitor);

    await vi.advanceTimersByTimeAsync(9_999);
    expect(monitor.check).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(monitor.check).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(monitor.check).toHaveBeenCalledTimes(3);
  });
});

test("a hidden tab stays quiet, and checks right away when it becomes visible again", async () => {
  await usingFakeTimers(async () => {
    restoreVisibility = setVisibilityState("hidden");
    const { monitor } = createMonitor();
    await watch(monitor);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(monitor.check).not.toHaveBeenCalled();

    restoreVisibility();
    restoreVisibility = setVisibilityState("visible");
    document.dispatchEvent(new Event("visibilitychange"));

    expect(monitor.check).toHaveBeenCalledTimes(1);
  });
});

test("stops checking once the tab is outdated", async () => {
  await usingFakeTimers(async () => {
    const { monitor, becomeOutdated } = createMonitor();
    await watch(monitor);
    becomeOutdated();

    await vi.advanceTimersByTimeAsync(60_000);
    document.dispatchEvent(new Event("visibilitychange"));

    expect(monitor.check).toHaveBeenCalledTimes(1);
  });
});

test("stops checking when the watcher unmounts", async () => {
  await usingFakeTimers(async () => {
    const { monitor } = createMonitor();
    const hook = await watch(monitor);

    await hook.unmount();
    hooks = [];
    await vi.advanceTimersByTimeAsync(60_000);
    document.dispatchEvent(new Event("visibilitychange"));

    expect(monitor.check).toHaveBeenCalledTimes(1);
  });
});
