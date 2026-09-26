import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { renderHook } from "vitest-browser-react";
import { navigate } from "./router";
import {
  type SessionActivityReporterOptions,
  useSessionActivityReporter,
} from "./sessionActivityReporter";
import type { SessionOutcome } from "./sessionApi";

type TouchSessionMock = ReturnType<typeof vi.fn<() => Promise<SessionOutcome>>>;

// A controllable stand-in for the wall clock, matching the hook's own `now` option (its own doc
// comment: "Injected clock so the throttle window is deterministic in tests"). Advancing it proves
// the throttle window's own boundary directly, instead of a real setTimeout racing against it.
function createClock(startMs = 0) {
  let currentMs = startMs;
  return {
    now: () => new Date(currentMs),
    advance(ms: number): void {
      currentMs += ms;
    },
  };
}

// touchSessionRef.current() is called synchronously inside the DOM event listener, so the mock
// already records the call before this returns; only the hook's own `await` of that same result
// (and the onTouched/onEnded it drives) still needs a moment to settle. Awaiting the exact promise
// the hook is itself awaiting queues after the hook's own continuation (registered on it first),
// so this resolves only once that continuation has actually run — not a guess at how many ticks it
// takes.
async function awaitLastTouch(touchSession: TouchSessionMock): Promise<void> {
  const results = touchSession.mock.results;
  await results.at(-1)?.value;
}

function okOutcome(expiresAt: string): SessionOutcome {
  return {
    kind: "ok",
    userId: "user-1",
    displayName: "Lucas Guardiola",
    isAdministrator: false,
    expiresAt,
  };
}

function renderReporter(initialProps: SessionActivityReporterOptions) {
  return renderHook(
    (props?: SessionActivityReporterOptions) => useSessionActivityReporter(props ?? initialProps),
    { initialProps },
  );
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

/** Temporarily makes `document.visibilityState` report `value`, restoring the real accessor after. */
function withVisibilityState(value: DocumentVisibilityState, run: () => Promise<void>) {
  const original = findVisibilityStateDescriptor();
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
  return run().finally(() => {
    if (original) {
      Object.defineProperty(document, "visibilityState", original);
    }
  });
}

let hooks: Array<{ unmount: () => Promise<void> }> = [];

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

afterEach(async () => {
  window.history.pushState(null, "", "/");
  for (const hook of hooks) {
    await hook.unmount();
  }
  hooks = [];
});

test("touches the session once real use happens", async () => {
  const touchSession = vi
    .fn<() => Promise<SessionOutcome>>()
    .mockResolvedValue(okOutcome("2099-01-01T00:00:00.000Z"));
  const clock = createClock();

  const hook = await renderReporter({
    active: true,
    touchSession,
    onTouched: vi.fn(),
    onEnded: vi.fn(),
    throttleMs: 10,
    now: clock.now,
  });
  hooks.push(hook);

  expect(touchSession).not.toHaveBeenCalled();
  clock.advance(20);
  window.dispatchEvent(new Event("pointerdown"));

  expect(touchSession).toHaveBeenCalledTimes(1);
});

test("collapses a burst of activity within the throttle window into a single touch", async () => {
  const touchSession = vi
    .fn<() => Promise<SessionOutcome>>()
    .mockResolvedValue(okOutcome("2099-01-01T00:00:00.000Z"));
  const clock = createClock();

  const hook = await renderReporter({
    active: true,
    touchSession,
    onTouched: vi.fn(),
    onEnded: vi.fn(),
    throttleMs: 30,
    now: clock.now,
  });
  hooks.push(hook);

  clock.advance(40);
  window.dispatchEvent(new Event("pointerdown"));
  expect(touchSession).toHaveBeenCalledTimes(1);
  // Settled first, so its own "sending" guard no longer holds the rest of the burst back: only
  // the throttle window does.
  await awaitLastTouch(touchSession);

  clock.advance(10);
  window.dispatchEvent(new KeyboardEvent("keydown"));
  clock.advance(10);
  window.dispatchEvent(new Event("wheel"));
  window.dispatchEvent(new Event("scroll"));
  clock.advance(9);
  window.dispatchEvent(new Event("touchstart"));

  expect(touchSession).toHaveBeenCalledTimes(1);
});

test("touches again once the throttle window passes", async () => {
  const touchSession = vi
    .fn<() => Promise<SessionOutcome>>()
    .mockResolvedValue(okOutcome("2099-01-01T00:00:00.000Z"));
  const clock = createClock();

  const hook = await renderReporter({
    active: true,
    touchSession,
    onTouched: vi.fn(),
    onEnded: vi.fn(),
    throttleMs: 25,
    now: clock.now,
  });
  hooks.push(hook);

  clock.advance(30);
  window.dispatchEvent(new Event("pointerdown"));
  expect(touchSession).toHaveBeenCalledTimes(1);
  // The first touch's own "sending" guard clears only once it settles; without waiting for that,
  // the second dispatch below would still find it in flight regardless of the clock.
  await awaitLastTouch(touchSession);

  clock.advance(30);
  window.dispatchEvent(new Event("keydown"));
  expect(touchSession).toHaveBeenCalledTimes(2);
});

test("touches nothing when there is no activity at all", async () => {
  const touchSession = vi
    .fn<() => Promise<SessionOutcome>>()
    .mockResolvedValue(okOutcome("2099-01-01T00:00:00.000Z"));
  const clock = createClock();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });

  try {
    const hook = await renderReporter({
      active: true,
      touchSession,
      onTouched: vi.fn(),
      onEnded: vi.fn(),
      throttleMs: 10,
      now: clock.now,
    });
    hooks.push(hook);

    // Both clocks well past several throttle windows: the injected one the throttle reads, and
    // the timers a touch scheduled on its own, without any activity, would run on.
    clock.advance(100);
    await vi.advanceTimersByTimeAsync(100);

    expect(touchSession).not.toHaveBeenCalled();
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
});

test("never treats a resting or moving cursor alone as activity", async () => {
  const touchSession = vi
    .fn<() => Promise<SessionOutcome>>()
    .mockResolvedValue(okOutcome("2099-01-01T00:00:00.000Z"));
  const clock = createClock();

  const hook = await renderReporter({
    active: true,
    touchSession,
    onTouched: vi.fn(),
    onEnded: vi.fn(),
    throttleMs: 10,
    now: clock.now,
  });
  hooks.push(hook);

  clock.advance(20);
  window.dispatchEvent(new Event("mousemove"));
  window.dispatchEvent(new Event("pointermove"));

  expect(touchSession).not.toHaveBeenCalled();
});

test("touches nothing while the document is hidden", async () => {
  const touchSession = vi
    .fn<() => Promise<SessionOutcome>>()
    .mockResolvedValue(okOutcome("2099-01-01T00:00:00.000Z"));
  const clock = createClock();

  await withVisibilityState("hidden", async () => {
    const hook = await renderReporter({
      active: true,
      touchSession,
      onTouched: vi.fn(),
      onEnded: vi.fn(),
      throttleMs: 10,
      now: clock.now,
    });
    hooks.push(hook);

    clock.advance(20);
    window.dispatchEvent(new Event("pointerdown"));

    expect(touchSession).not.toHaveBeenCalled();
  });
});

test("counts an in-app navigation as activity", async () => {
  const touchSession = vi
    .fn<() => Promise<SessionOutcome>>()
    .mockResolvedValue(okOutcome("2099-01-01T00:00:00.000Z"));
  const clock = createClock();

  const hook = await renderReporter({
    active: true,
    touchSession,
    onTouched: vi.fn(),
    onEnded: vi.fn(),
    throttleMs: 10,
    now: clock.now,
  });
  hooks.push(hook);

  clock.advance(20);
  navigate("/help", { replace: true });

  expect(touchSession).toHaveBeenCalledTimes(1);
});

test("ends the session when a touch finds it no longer open", async () => {
  const touchSession = vi.fn<() => Promise<SessionOutcome>>().mockResolvedValue({
    kind: "unauthenticated",
  });
  const onEnded = vi.fn();
  const clock = createClock();

  const hook = await renderReporter({
    active: true,
    touchSession,
    onTouched: vi.fn(),
    onEnded,
    throttleMs: 10,
    now: clock.now,
  });
  hooks.push(hook);

  clock.advance(20);
  window.dispatchEvent(new Event("pointerdown"));
  await awaitLastTouch(touchSession);

  expect(onEnded).toHaveBeenCalledTimes(1);
});

test("hands the refreshed session, with its new expiresAt and current access, to onTouched after a successful touch", async () => {
  const refreshed: SessionOutcome = {
    kind: "ok",
    userId: "user-1",
    displayName: "Lucas Guardiola",
    isAdministrator: false,
    expiresAt: "2099-06-01T00:00:00.000Z",
    permissions: ["void_sale"],
  };
  const touchSession = vi.fn<() => Promise<SessionOutcome>>().mockResolvedValue(refreshed);
  const onTouched = vi.fn();
  const clock = createClock();

  const hook = await renderReporter({
    active: true,
    touchSession,
    onTouched,
    onEnded: vi.fn(),
    throttleMs: 10,
    now: clock.now,
  });
  hooks.push(hook);

  clock.advance(20);
  window.dispatchEvent(new Event("pointerdown"));
  await awaitLastTouch(touchSession);

  expect(onTouched).toHaveBeenCalledTimes(1);
  expect(onTouched).toHaveBeenCalledWith(refreshed);
});

test("leaves the tab signed in when a touch only finds network trouble or a rate limit", async () => {
  const touchSession = vi
    .fn<() => Promise<SessionOutcome>>()
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 60 });
  const onEnded = vi.fn();
  const onTouched = vi.fn();
  const clock = createClock();

  const hook = await renderReporter({
    active: true,
    touchSession,
    onTouched,
    onEnded,
    throttleMs: 10,
    now: clock.now,
  });
  hooks.push(hook);

  clock.advance(20);
  window.dispatchEvent(new Event("pointerdown"));
  await awaitLastTouch(touchSession);

  expect(touchSession).toHaveBeenCalledTimes(1);
  expect(onEnded).not.toHaveBeenCalled();
  expect(onTouched).not.toHaveBeenCalled();
});

test("runs at most one touch at a time, even when the previous one is still pending", async () => {
  let resolveFirst: (() => void) | undefined;
  const touchSession = vi.fn<() => Promise<SessionOutcome>>().mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveFirst = () => resolve(okOutcome("2099-01-01T00:00:00.000Z"));
      }),
  );
  const clock = createClock();

  const hook = await renderReporter({
    active: true,
    touchSession,
    onTouched: vi.fn(),
    onEnded: vi.fn(),
    throttleMs: 10,
    now: clock.now,
  });
  hooks.push(hook);

  clock.advance(20);
  window.dispatchEvent(new Event("pointerdown"));
  expect(touchSession).toHaveBeenCalledTimes(1);

  // Still pending: a second activity event during the same in-flight touch calls nothing new,
  // deterministically, since the pending touch never resolved to clear its own "sending" guard.
  window.dispatchEvent(new Event("keydown"));
  expect(touchSession).toHaveBeenCalledTimes(1);

  resolveFirst?.();
  // Awaiting the exact promise the pending touch is itself awaiting proves its own "sending"
  // guard has cleared, rather than guessing how long that settling takes.
  await awaitLastTouch(touchSession);

  clock.advance(20);
  window.dispatchEvent(new Event("keydown"));
  expect(touchSession).toHaveBeenCalledTimes(2);
});

test("stops touching once no longer active", async () => {
  const touchSession = vi
    .fn<() => Promise<SessionOutcome>>()
    .mockResolvedValue(okOutcome("2099-01-01T00:00:00.000Z"));
  const clock = createClock();

  const hook = await renderReporter({
    active: true,
    touchSession,
    onTouched: vi.fn(),
    onEnded: vi.fn(),
    throttleMs: 10,
    now: clock.now,
  });
  hooks.push(hook);

  clock.advance(20);
  await hook.rerender({
    active: false,
    touchSession,
    onTouched: vi.fn(),
    onEnded: vi.fn(),
    throttleMs: 10,
    now: clock.now,
  });
  window.dispatchEvent(new Event("pointerdown"));

  expect(touchSession).not.toHaveBeenCalled();
});

test("stops touching once the component unmounts", async () => {
  const touchSession = vi
    .fn<() => Promise<SessionOutcome>>()
    .mockResolvedValue(okOutcome("2099-01-01T00:00:00.000Z"));
  const clock = createClock();

  const hook = await renderReporter({
    active: true,
    touchSession,
    onTouched: vi.fn(),
    onEnded: vi.fn(),
    throttleMs: 10,
    now: clock.now,
  });

  clock.advance(20);
  await hook.unmount();
  window.dispatchEvent(new Event("pointerdown"));

  expect(touchSession).not.toHaveBeenCalled();
});
