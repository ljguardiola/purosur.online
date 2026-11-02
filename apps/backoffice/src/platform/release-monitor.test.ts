import { expect, test, vi } from "vitest";
import { createReleaseMonitor } from "./release-monitor";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

test("a tab is not outdated before it has checked", () => {
  const monitor = createReleaseMonitor({ running: "aaa", readDeployedRelease: vi.fn() });

  expect(monitor.outdated()).toBe(false);
});

test("a tab running the deployed release is not outdated", async () => {
  const monitor = createReleaseMonitor({
    running: "aaa",
    readDeployedRelease: vi.fn().mockResolvedValue("aaa"),
  });

  await monitor.check();

  expect(monitor.outdated()).toBe(false);
});

test("a tab running another release than the deployed one is outdated, and tells its subscribers", async () => {
  const monitor = createReleaseMonitor({
    running: "aaa",
    readDeployedRelease: vi.fn().mockResolvedValue("bbb"),
  });
  const listener = vi.fn();
  monitor.subscribe(listener);

  await monitor.check();

  expect(monitor.outdated()).toBe(true);
  expect(listener).toHaveBeenCalledTimes(1);
});

test("a subscriber that unsubscribed is no longer told", async () => {
  const monitor = createReleaseMonitor({
    running: "aaa",
    readDeployedRelease: vi.fn().mockResolvedValue("bbb"),
  });
  const listener = vi.fn();
  monitor.subscribe(listener)();

  await monitor.check();

  expect(listener).not.toHaveBeenCalled();
});

test("a failed read changes nothing and the next check reads again", async () => {
  const read = vi
    .fn<() => Promise<string | undefined>>()
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce("bbb");
  const monitor = createReleaseMonitor({ running: "aaa", readDeployedRelease: read });

  await monitor.check();
  expect(monitor.outdated()).toBe(false);

  await monitor.check();
  expect(monitor.outdated()).toBe(true);
});

test("once outdated a tab stays outdated and stops reading the deployed release", async () => {
  const read = vi
    .fn<() => Promise<string | undefined>>()
    .mockResolvedValueOnce("bbb")
    .mockResolvedValue("aaa");
  const monitor = createReleaseMonitor({ running: "aaa", readDeployedRelease: read });

  await monitor.check();
  await monitor.check();

  expect(monitor.outdated()).toBe(true);
  expect(read).toHaveBeenCalledTimes(1);
});

test("checks made while one is reading share that read", async () => {
  const pending = deferred<string | undefined>();
  const read = vi.fn(() => pending.promise);
  const monitor = createReleaseMonitor({ running: "aaa", readDeployedRelease: read });

  const first = monitor.check();
  const second = monitor.check();
  pending.resolve("bbb");
  await Promise.all([first, second]);

  expect(read).toHaveBeenCalledTimes(1);
  expect(monitor.outdated()).toBe(true);
});

test("a tab that does not know its own release never reads the deployed one and is never outdated", async () => {
  const read = vi.fn().mockResolvedValue("bbb");
  const monitor = createReleaseMonitor({ running: "", readDeployedRelease: read });

  await monitor.check();

  expect(read).not.toHaveBeenCalled();
  expect(monitor.outdated()).toBe(false);
});

test("a tab told a deployed release other than its own is outdated at once, and tells its subscribers", () => {
  const read = vi.fn();
  const monitor = createReleaseMonitor({ running: "aaa", readDeployedRelease: read });
  const listener = vi.fn();
  monitor.subscribe(listener);

  monitor.observe("bbb");

  expect(monitor.outdated()).toBe(true);
  expect(listener).toHaveBeenCalledTimes(1);
  expect(read).not.toHaveBeenCalled();
});

test("a tab told the release it runs stays current", () => {
  const monitor = createReleaseMonitor({ running: "aaa", readDeployedRelease: vi.fn() });
  const listener = vi.fn();
  monitor.subscribe(listener);

  monitor.observe("aaa");

  expect(monitor.outdated()).toBe(false);
  expect(listener).not.toHaveBeenCalled();
});

test("an outdated tab told another release again tells its subscribers only once", () => {
  const monitor = createReleaseMonitor({ running: "aaa", readDeployedRelease: vi.fn() });
  const listener = vi.fn();
  monitor.subscribe(listener);

  monitor.observe("bbb");
  monitor.observe("ccc");

  expect(listener).toHaveBeenCalledTimes(1);
});

test("a tab that does not know its own release is never outdated by a release it is told", () => {
  const monitor = createReleaseMonitor({ running: "", readDeployedRelease: vi.fn() });

  monitor.observe("bbb");

  expect(monitor.outdated()).toBe(false);
});
