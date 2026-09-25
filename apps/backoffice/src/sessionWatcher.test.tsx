import { afterEach, expect, test, vi } from "vitest";
import { renderHook } from "vitest-browser-react";
import type { SessionStatusOutcome } from "./sessionApi";
import { type SessionWatcherOptions, useSessionWatcher } from "./sessionWatcher";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function renderWatcher(initialProps: SessionWatcherOptions) {
  return renderHook((props?: SessionWatcherOptions) => useSessionWatcher(props ?? initialProps), {
    initialProps,
  });
}

/** Finds `visibilityState`'s own property descriptor anywhere up `document`'s prototype chain. */
function findVisibilityStateDescriptor(): PropertyDescriptor | undefined {
  for (
    let target: object | null = document;
    target !== null;
    target = Object.getPrototypeOf(target)
  ) {
    const descriptor = Object.getOwnPropertyDescriptor(target, "visibilityState");
    if (descriptor) {
      return descriptor;
    }
  }
  return undefined;
}

/** Makes `document.visibilityState` report `value` until the returned function restores the real accessor. */
function setVisibilityState(value: DocumentVisibilityState): () => void {
  const original = findVisibilityStateDescriptor();
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
  return () => {
    if (original) {
      Object.defineProperty(document, "visibilityState", original);
    }
  };
}

let hooks: Array<{ unmount: () => Promise<void> }> = [];

afterEach(async () => {
  for (const hook of hooks) {
    await hook.unmount();
  }
  hooks = [];
});

test("ends the session once the known deadline (plus its margin) passes", async () => {
  const checkStatus = vi.fn<() => Promise<SessionStatusOutcome>>().mockResolvedValue({
    kind: "unauthenticated",
  });
  const onEnded = vi.fn();
  const fixedNow = new Date("2026-09-23T12:00:00.000Z");

  const hook = await renderWatcher({
    active: true,
    initialExpiresAt: new Date(fixedNow.getTime() + 20).toISOString(),
    checkStatus,
    onEnded,
    intervalMs: 10_000,
    deadlineMarginMs: 0,
    now: () => fixedNow,
  });
  hooks.push(hook);

  expect(onEnded).not.toHaveBeenCalled();

  await expect.poll(() => onEnded.mock.calls.length).toBe(1);
});

test("moves the deadline check out when an open status reports a later expiresAt", async () => {
  const fixedNow = new Date("2026-09-23T12:00:00.000Z");
  const laterExpiresAt = () => new Date(fixedNow.getTime() + 150).toISOString();
  const checkStatus = vi
    .fn<() => Promise<SessionStatusOutcome>>()
    .mockResolvedValueOnce({ kind: "ok", expiresAt: laterExpiresAt() })
    .mockResolvedValue({ kind: "ok", expiresAt: laterExpiresAt() });
  const onEnded = vi.fn();

  const hook = await renderWatcher({
    active: true,
    initialExpiresAt: new Date(fixedNow.getTime() + 15).toISOString(),
    checkStatus,
    onEnded,
    intervalMs: 10_000,
    deadlineMarginMs: 0,
    now: () => fixedNow,
  });
  hooks.push(hook);

  // The original ~15ms deadline fires the first check, which reports the session open until
  // ~150ms out. Once rearmed, that stale ~15ms deadline must not fire a second check on its own.
  await expect.poll(() => checkStatus.mock.calls.length).toBe(1);
  await wait(60);
  expect(checkStatus).toHaveBeenCalledTimes(1);
  expect(onEnded).not.toHaveBeenCalled();

  // The rescheduled ~150ms deadline fires a second check.
  await expect.poll(() => checkStatus.mock.calls.length).toBeGreaterThanOrEqual(2);
  expect(onEnded).not.toHaveBeenCalled();
});

test("keeps checking every interval even without a known deadline, and ends the session on a revocation", async () => {
  // Only the first check reports the revocation: a real caller flips `active` off the instant
  // `onEnded` fires, so nothing here depends on further checks staying silent afterwards.
  const checkStatus = vi
    .fn<() => Promise<SessionStatusOutcome>>()
    .mockResolvedValueOnce({ kind: "unauthenticated" })
    .mockResolvedValue({ kind: "ok", expiresAt: "2099-01-01T00:00:00.000Z" });
  const onEnded = vi.fn();

  const hook = await renderWatcher({
    active: true,
    checkStatus,
    onEnded,
    intervalMs: 15,
  });
  hooks.push(hook);

  await expect.poll(() => checkStatus.mock.calls.length).toBeGreaterThan(0);
  await expect.poll(() => onEnded.mock.calls.length).toBe(1);
});

test("checks again as soon as the tab becomes visible", async () => {
  const checkStatus = vi.fn<() => Promise<SessionStatusOutcome>>().mockResolvedValue({
    kind: "unauthenticated",
  });
  const onEnded = vi.fn();

  const hook = await renderWatcher({
    active: true,
    checkStatus,
    onEnded,
    intervalMs: 10_000,
  });
  hooks.push(hook);

  await wait(20);
  expect(checkStatus).not.toHaveBeenCalled();

  document.dispatchEvent(new Event("visibilitychange"));

  await expect.poll(() => onEnded.mock.calls.length).toBe(1);
});

test("leaves the tab signed in when a check only finds network trouble or a rate limit", async () => {
  const checkStatus = vi
    .fn<() => Promise<SessionStatusOutcome>>()
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "rate_limited", retryAfterSeconds: 60 })
    .mockResolvedValue({ kind: "failed" });
  const onEnded = vi.fn();

  const hook = await renderWatcher({
    active: true,
    checkStatus,
    onEnded,
    intervalMs: 15,
  });
  hooks.push(hook);

  await expect.poll(() => checkStatus.mock.calls.length).toBeGreaterThanOrEqual(2);
  await wait(30);
  expect(onEnded).not.toHaveBeenCalled();
});

test("leaves the tab signed in while the status check keeps finding the session open", async () => {
  const checkStatus = vi
    .fn<() => Promise<SessionStatusOutcome>>()
    .mockResolvedValue({ kind: "ok", expiresAt: "2099-01-01T00:00:00.000Z" });
  const onEnded = vi.fn();

  const hook = await renderWatcher({
    active: true,
    checkStatus,
    onEnded,
    intervalMs: 15,
  });
  hooks.push(hook);

  await expect.poll(() => checkStatus.mock.calls.length).toBeGreaterThanOrEqual(2);
  expect(onEnded).not.toHaveBeenCalled();
});

test("runs at most one check at a time, even when the previous one is still pending", async () => {
  let resolveFirst: (() => void) | undefined;
  const checkStatus = vi.fn<() => Promise<SessionStatusOutcome>>().mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveFirst = () => resolve({ kind: "ok", expiresAt: "2099-01-01T00:00:00.000Z" });
      }),
  );
  const onEnded = vi.fn();

  const hook = await renderWatcher({
    active: true,
    checkStatus,
    onEnded,
    intervalMs: 10,
  });
  hooks.push(hook);

  await expect.poll(() => checkStatus.mock.calls.length).toBe(1);
  await wait(40);
  expect(checkStatus).toHaveBeenCalledTimes(1);

  resolveFirst?.();

  await expect.poll(() => checkStatus.mock.calls.length).toBeGreaterThan(1);
});

test("stops checking once the session is no longer active", async () => {
  // As above: only the first check reports the revocation, since a real caller flips `active`
  // off the instant `onEnded` fires.
  const checkStatus = vi
    .fn<() => Promise<SessionStatusOutcome>>()
    .mockResolvedValueOnce({ kind: "unauthenticated" })
    .mockResolvedValue({ kind: "ok", expiresAt: "2099-01-01T00:00:00.000Z" });
  const onEnded = vi.fn();

  const hook = await renderWatcher({
    active: true,
    checkStatus,
    onEnded,
    intervalMs: 10,
  });
  hooks.push(hook);

  await expect.poll(() => onEnded.mock.calls.length).toBe(1);
  const callsWhileActive = checkStatus.mock.calls.length;

  await hook.rerender({ active: false, checkStatus, onEnded, intervalMs: 10 });
  onEnded.mockClear();
  await wait(50);

  expect(checkStatus.mock.calls.length).toBe(callsWhileActive);
  expect(onEnded).not.toHaveBeenCalled();
});

test("moves the deadline out from a fresh initialExpiresAt without restarting the interval-driven check", async () => {
  // Real use touching the session reports a new deadline through this same prop; that must not
  // tear down and recreate the interval or its listeners on every touch.
  const checkStatus = vi.fn<() => Promise<SessionStatusOutcome>>().mockResolvedValue({
    kind: "ok",
    expiresAt: "2099-01-01T00:00:00.000Z",
  });
  const onEnded = vi.fn();
  const setIntervalSpy = vi.spyOn(window, "setInterval");
  const fixedNow = new Date("2026-09-23T12:00:00.000Z");

  const hook = await renderWatcher({
    active: true,
    initialExpiresAt: new Date(fixedNow.getTime() + 1_000).toISOString(),
    checkStatus,
    onEnded,
    intervalMs: 10_000,
    deadlineMarginMs: 0,
    now: () => fixedNow,
  });
  hooks.push(hook);

  const setIntervalCallsAfterMount = setIntervalSpy.mock.calls.length;

  await hook.rerender({
    active: true,
    initialExpiresAt: new Date(fixedNow.getTime() + 20).toISOString(),
    checkStatus,
    onEnded,
    intervalMs: 10_000,
    deadlineMarginMs: 0,
    now: () => fixedNow,
  });

  expect(setIntervalSpy.mock.calls.length).toBe(setIntervalCallsAfterMount);
  await expect.poll(() => checkStatus.mock.calls.length).toBeGreaterThan(0);
  expect(onEnded).not.toHaveBeenCalled();

  setIntervalSpy.mockRestore();
});

test("stops checking once the component unmounts", async () => {
  const checkStatus = vi.fn<() => Promise<SessionStatusOutcome>>().mockResolvedValue({
    kind: "ok",
    expiresAt: "2099-01-01T00:00:00.000Z",
  });
  const onEnded = vi.fn();

  const hook = await renderWatcher({
    active: true,
    checkStatus,
    onEnded,
    intervalMs: 10,
  });

  await expect.poll(() => checkStatus.mock.calls.length).toBeGreaterThan(0);
  await hook.unmount();
  const callsAtUnmount = checkStatus.mock.calls.length;
  await wait(50);

  expect(checkStatus.mock.calls.length).toBe(callsAtUnmount);
});

test("does not keep re-checking a deadline the browser's clock already considers past", async () => {
  // The browser's clock running ahead of the cloud's: the cloud keeps answering "open" with the
  // same deadline the browser already sees as gone.
  const fixedNow = new Date("2026-09-23T12:00:00.000Z");
  let skewMs = 0;
  const expiresAt = new Date(fixedNow.getTime() + 20).toISOString();
  const checkStatus = vi.fn<() => Promise<SessionStatusOutcome>>().mockImplementation(() => {
    skewMs = 60_000;
    return Promise.resolve({ kind: "ok", expiresAt });
  });
  const onEnded = vi.fn();

  const hook = await renderWatcher({
    active: true,
    initialExpiresAt: expiresAt,
    checkStatus,
    onEnded,
    intervalMs: 10_000,
    deadlineMarginMs: 0,
    now: () => new Date(fixedNow.getTime() + skewMs),
  });
  hooks.push(hook);

  await expect.poll(() => checkStatus.mock.calls.length).toBe(1);
  await wait(100);

  expect(checkStatus).toHaveBeenCalledTimes(1);
  expect(onEnded).not.toHaveBeenCalled();
});

test("checks nothing while the tab is hidden, and once as soon as it becomes visible again", async () => {
  const checkStatus = vi
    .fn<() => Promise<SessionStatusOutcome>>()
    .mockImplementation(() => new Promise(() => {}));
  const restoreVisibility = setVisibilityState("hidden");

  try {
    const hook = await renderWatcher({
      active: true,
      initialExpiresAt: new Date(Date.now() + 10).toISOString(),
      checkStatus,
      onEnded: vi.fn(),
      intervalMs: 10,
      deadlineMarginMs: 0,
    });
    hooks.push(hook);

    await wait(60);
    expect(checkStatus).not.toHaveBeenCalled();
  } finally {
    restoreVisibility();
  }

  document.dispatchEvent(new Event("visibilitychange"));

  await expect.poll(() => checkStatus.mock.calls.length).toBe(1);
  await wait(40);
  expect(checkStatus).toHaveBeenCalledTimes(1);
});
