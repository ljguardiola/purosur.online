import { afterEach, expect, test, vi } from "vitest";
import { renderHook } from "vitest-browser-react";
import type { SessionStatusOutcome } from "./sessionApi";
import { type SessionWatcherOptions, useSessionWatcher } from "./sessionWatcher";

// The watcher schedules its deadline and interval checks with the browser's own setTimeout and
// setInterval, so freezing those lets every test move exactly as far as its own deadline or
// interval boundary instead of racing a real timer of the same few milliseconds. Advancing with
// the *Async variant also runs the microtasks a check's own `await checkStatusRef.current()`
// needs to settle, so nothing here has to guess how many ticks that takes either.
async function usingFakeTimers(steps: () => Promise<void>): Promise<void> {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  try {
    await steps();
  } finally {
    // Not runAllTimers(): a still-running setInterval would keep rescheduling itself forever.
    vi.clearAllTimers();
    vi.useRealTimers();
  }
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
  await usingFakeTimers(async () => {
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
      deadlineMarginMs: 50,
      now: () => fixedNow,
    });
    hooks.push(hook);

    await vi.advanceTimersByTimeAsync(69);
    expect(checkStatus).not.toHaveBeenCalled();
    expect(onEnded).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(onEnded).toHaveBeenCalledTimes(1);
  });
});

test("moves the deadline check out when an open status reports a later expiresAt", async () => {
  await usingFakeTimers(async () => {
    const fixedNow = new Date("2026-09-23T12:00:00.000Z");
    const laterExpiresAt = new Date(fixedNow.getTime() + 500).toISOString();
    const checkStatus = vi
      .fn<() => Promise<SessionStatusOutcome>>()
      .mockResolvedValue({ kind: "ok", expiresAt: laterExpiresAt });
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

    // The original 15ms deadline fires the first check, which reports the session open until
    // 500ms out and re-arms from it.
    await vi.advanceTimersByTimeAsync(15);
    expect(checkStatus).toHaveBeenCalledTimes(1);

    // The stale 15ms deadline is gone, so nothing fires again short of the rescheduled one, itself
    // timed from the moment it was armed (virtual t=15), landing at t=515.
    await vi.advanceTimersByTimeAsync(499);
    expect(checkStatus).toHaveBeenCalledTimes(1);
    expect(onEnded).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(checkStatus).toHaveBeenCalledTimes(2);
    expect(onEnded).not.toHaveBeenCalled();
  });
});

test("keeps checking every interval even without a known deadline, and ends the session on a revocation", async () => {
  await usingFakeTimers(async () => {
    const fixedNow = new Date("2026-09-23T12:00:00.000Z");
    const expiresAt = new Date(fixedNow.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const checkStatus = vi
      .fn<() => Promise<SessionStatusOutcome>>()
      .mockResolvedValueOnce({ kind: "unauthenticated" })
      .mockResolvedValue({ kind: "ok", expiresAt });
    const onEnded = vi.fn();

    const hook = await renderWatcher({
      active: true,
      checkStatus,
      onEnded,
      intervalMs: 15,
      now: () => fixedNow,
    });
    hooks.push(hook);

    await vi.advanceTimersByTimeAsync(15);

    expect(onEnded).toHaveBeenCalledTimes(1);
  });
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

  // A visibilitychange check runs directly from the DOM event, not from any timer, so this needs
  // no fake clock at all: the far interval alone would never have fired by now regardless.
  expect(checkStatus).not.toHaveBeenCalled();

  document.dispatchEvent(new Event("visibilitychange"));
  await vi.waitFor(() => expect(onEnded).toHaveBeenCalledTimes(1));
});

test("leaves the tab signed in when a check only finds network trouble or a rate limit", async () => {
  await usingFakeTimers(async () => {
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

    await vi.advanceTimersByTimeAsync(15);
    await vi.advanceTimersByTimeAsync(15);
    await vi.advanceTimersByTimeAsync(15);

    expect(checkStatus).toHaveBeenCalledTimes(3);
    expect(onEnded).not.toHaveBeenCalled();
  });
});

test("leaves the tab signed in while the status check keeps finding the session open", async () => {
  await usingFakeTimers(async () => {
    // A day out, not some far-future placeholder: window.setTimeout's delay overflows its 32-bit
    // signed int and fires almost at once past about 24.8 days, which a real multi-year deadline
    // would trip the moment each "ok" reschedules from it.
    const fixedNow = new Date("2026-09-23T12:00:00.000Z");
    const expiresAt = new Date(fixedNow.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const checkStatus = vi
      .fn<() => Promise<SessionStatusOutcome>>()
      .mockResolvedValue({ kind: "ok", expiresAt });
    const onEnded = vi.fn();

    const hook = await renderWatcher({
      active: true,
      checkStatus,
      onEnded,
      intervalMs: 15,
      now: () => fixedNow,
    });
    hooks.push(hook);

    await vi.advanceTimersByTimeAsync(15);
    await vi.advanceTimersByTimeAsync(15);

    expect(checkStatus).toHaveBeenCalledTimes(2);
    expect(onEnded).not.toHaveBeenCalled();
  });
});

test("runs at most one check at a time, even when the previous one is still pending", async () => {
  await usingFakeTimers(async () => {
    // A day out: see the same note in "leaves the tab signed in while the status check keeps
    // finding the session open" about a multi-year placeholder overflowing setTimeout's delay.
    const fixedNow = new Date("2026-09-23T12:00:00.000Z");
    const expiresAt = new Date(fixedNow.getTime() + 24 * 60 * 60 * 1000).toISOString();
    let resolveFirst: (() => void) | undefined;
    const checkStatus = vi.fn<() => Promise<SessionStatusOutcome>>().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFirst = () => resolve({ kind: "ok", expiresAt });
        }),
    );
    const onEnded = vi.fn();

    const hook = await renderWatcher({
      active: true,
      checkStatus,
      onEnded,
      intervalMs: 10,
      now: () => fixedNow,
    });
    hooks.push(hook);

    await vi.advanceTimersByTimeAsync(10);
    expect(checkStatus).toHaveBeenCalledTimes(1);

    // Four more interval ticks while the first check is still pending: its own "checking" guard
    // keeps every one of them from calling out again.
    await vi.advanceTimersByTimeAsync(40);
    expect(checkStatus).toHaveBeenCalledTimes(1);

    resolveFirst?.();
    await vi.advanceTimersByTimeAsync(10);
    expect(checkStatus).toHaveBeenCalledTimes(2);
  });
});

test("stops checking once the session is no longer active", async () => {
  await usingFakeTimers(async () => {
    // Only the first check reports the revocation: a real caller flips `active` off the instant
    // `onEnded` fires, so no later check would ever see one.
    const fixedNow = new Date("2026-09-23T12:00:00.000Z");
    const expiresAt = new Date(fixedNow.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const checkStatus = vi
      .fn<() => Promise<SessionStatusOutcome>>()
      .mockResolvedValueOnce({ kind: "unauthenticated" })
      .mockResolvedValue({ kind: "ok", expiresAt });
    const onEnded = vi.fn();

    const hook = await renderWatcher({
      active: true,
      checkStatus,
      onEnded,
      intervalMs: 10,
      now: () => fixedNow,
    });
    hooks.push(hook);

    await vi.advanceTimersByTimeAsync(10);
    expect(onEnded).toHaveBeenCalledTimes(1);
    const callsWhileActive = checkStatus.mock.calls.length;

    await hook.rerender({
      active: false,
      checkStatus,
      onEnded,
      intervalMs: 10,
      now: () => fixedNow,
    });
    onEnded.mockClear();

    await vi.advanceTimersByTimeAsync(50);

    expect(checkStatus.mock.calls.length).toBe(callsWhileActive);
    expect(onEnded).not.toHaveBeenCalled();
  });
});

test("moves the deadline out from a fresh initialExpiresAt without restarting the interval-driven check", async () => {
  await usingFakeTimers(async () => {
    // Real use touching the session reports a new deadline through this same prop; that must not
    // tear down and recreate the interval or its listeners on every touch.
    const fixedNow = new Date("2026-09-23T12:00:00.000Z");
    const checkStatus = vi.fn<() => Promise<SessionStatusOutcome>>().mockResolvedValue({
      kind: "ok",
      expiresAt: new Date(fixedNow.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    });
    const onEnded = vi.fn();
    const setIntervalSpy = vi.spyOn(window, "setInterval");

    const hook = await renderWatcher({
      active: true,
      initialExpiresAt: new Date(fixedNow.getTime() + 60_000).toISOString(),
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

    await vi.advanceTimersByTimeAsync(20);

    expect(checkStatus).toHaveBeenCalledTimes(1);
    expect(onEnded).not.toHaveBeenCalled();

    setIntervalSpy.mockRestore();
  });
});

test("stops checking once the component unmounts", async () => {
  await usingFakeTimers(async () => {
    const fixedNow = new Date("2026-09-23T12:00:00.000Z");
    const checkStatus = vi.fn<() => Promise<SessionStatusOutcome>>().mockResolvedValue({
      kind: "ok",
      expiresAt: new Date(fixedNow.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    });
    const onEnded = vi.fn();

    const hook = await renderWatcher({
      active: true,
      checkStatus,
      onEnded,
      intervalMs: 10,
      now: () => fixedNow,
    });

    await vi.advanceTimersByTimeAsync(10);
    await hook.unmount();
    const callsAtUnmount = checkStatus.mock.calls.length;

    await vi.advanceTimersByTimeAsync(50);

    expect(checkStatus.mock.calls.length).toBe(callsAtUnmount);
  });
});

test("does not keep re-checking a deadline the browser's clock already considers past", async () => {
  await usingFakeTimers(async () => {
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

    await vi.advanceTimersByTimeAsync(20);
    expect(checkStatus).toHaveBeenCalledTimes(1);

    // No new deadline timeout was armed, and the 10-second interval is nowhere near due either.
    await vi.advanceTimersByTimeAsync(5_000);

    expect(checkStatus).toHaveBeenCalledTimes(1);
    expect(onEnded).not.toHaveBeenCalled();
  });
});

test("checks nothing while the tab is hidden, and once as soon as it becomes visible again", async () => {
  await usingFakeTimers(async () => {
    const checkStatus = vi
      .fn<() => Promise<SessionStatusOutcome>>()
      .mockImplementation(() => new Promise(() => {}));
    const restoreVisibility = setVisibilityState("hidden");
    const fixedNow = new Date("2026-09-23T12:00:00.000Z");

    try {
      const hook = await renderWatcher({
        active: true,
        initialExpiresAt: new Date(fixedNow.getTime() + 10).toISOString(),
        checkStatus,
        onEnded: vi.fn(),
        intervalMs: 10,
        deadlineMarginMs: 0,
        now: () => fixedNow,
      });
      hooks.push(hook);

      // Past both the deadline timer and several interval ticks: both fire while hidden, but
      // check()'s own visibility guard keeps either from ever calling out.
      await vi.advanceTimersByTimeAsync(60);
      expect(checkStatus).not.toHaveBeenCalled();
    } finally {
      restoreVisibility();
    }

    document.dispatchEvent(new Event("visibilitychange"));
    expect(checkStatus).toHaveBeenCalledTimes(1);

    // The check above never resolves, so its own "checking" guard keeps a later interval tick
    // from calling out again while it's still pending.
    await vi.advanceTimersByTimeAsync(40);
    expect(checkStatus).toHaveBeenCalledTimes(1);
  });
});
