import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { renderHook } from "vitest-browser-react";
import type { SessionOutcome } from "../access/session-api";
import { openSession } from "../access/test-support/open-session";
import {
  type SessionActivityReporterOptions,
  useSessionActivityReporter,
} from "./session-activity-reporter";

type TouchSessionMock = ReturnType<typeof vi.fn<() => Promise<SessionOutcome>>>;

function createControllableClock(startMs = 0) {
  let currentMs = startMs;
  return {
    now: () => new Date(currentMs),
    advance(ms: number): void {
      currentMs += ms;
    },
  };
}

// Awaiting the mock's own promise queues after the hook's continuation on that same promise.
async function awaitHookToSettleAfterTouch(touchSession: TouchSessionMock): Promise<void> {
  const results = touchSession.mock.results;
  await results.at(-1)?.value;
}

function okOutcome(expiresAt: string): SessionOutcome {
  return openSession({ isAdministrator: false, expiresAt });
}

type ReporterProps = Omit<SessionActivityReporterOptions, "subscribeToNavigation">;

function createNavigationEvents() {
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    navigate(): void {
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

let navigation = createNavigationEvents();

function renderReporter(initialProps: ReporterProps) {
  return renderHook(
    (props?: ReporterProps) =>
      useSessionActivityReporter({
        ...(props ?? initialProps),
        subscribeToNavigation: navigation.subscribe,
      }),
    { initialProps },
  );
}

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

// document.visibilityState has no setter, so this overrides its descriptor and restores the
// original after.
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
  navigation = createNavigationEvents();
});

afterEach(async () => {
  for (const hook of hooks) {
    await hook.unmount();
  }
  hooks = [];
});

test("touches the session once real use happens", async () => {
  const touchSession = vi
    .fn<() => Promise<SessionOutcome>>()
    .mockResolvedValue(okOutcome("2099-01-01T00:00:00.000Z"));
  const clock = createControllableClock();

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
  const clock = createControllableClock();

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
  await awaitHookToSettleAfterTouch(touchSession);

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
  const clock = createControllableClock();

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
  await awaitHookToSettleAfterTouch(touchSession);

  clock.advance(30);
  window.dispatchEvent(new Event("keydown"));
  expect(touchSession).toHaveBeenCalledTimes(2);
});

test("touches nothing when there is no activity at all", async () => {
  const touchSession = vi
    .fn<() => Promise<SessionOutcome>>()
    .mockResolvedValue(okOutcome("2099-01-01T00:00:00.000Z"));
  const clock = createControllableClock();
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
  const clock = createControllableClock();

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
  const clock = createControllableClock();

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
  const clock = createControllableClock();

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
  navigation.navigate();

  expect(touchSession).toHaveBeenCalledTimes(1);
});

test("ends the session when a touch finds it no longer open", async () => {
  const touchSession = vi.fn<() => Promise<SessionOutcome>>().mockResolvedValue({
    kind: "unauthenticated",
  });
  const onEnded = vi.fn();
  const clock = createControllableClock();

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
  await awaitHookToSettleAfterTouch(touchSession);

  expect(onEnded).toHaveBeenCalledTimes(1);
});

test("hands the refreshed session, with its new expiresAt and current access, to onTouched after a successful touch", async () => {
  const refreshed: SessionOutcome = openSession({
    isAdministrator: false,
    expiresAt: "2099-06-01T00:00:00.000Z",
    permissions: ["void_sale"],
  });
  const touchSession = vi.fn<() => Promise<SessionOutcome>>().mockResolvedValue(refreshed);
  const onTouched = vi.fn();
  const clock = createControllableClock();

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
  await awaitHookToSettleAfterTouch(touchSession);

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
  const clock = createControllableClock();

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
  await awaitHookToSettleAfterTouch(touchSession);

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
  const clock = createControllableClock();

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

  window.dispatchEvent(new Event("keydown"));
  expect(touchSession).toHaveBeenCalledTimes(1);

  resolveFirst?.();
  await awaitHookToSettleAfterTouch(touchSession);

  clock.advance(20);
  window.dispatchEvent(new Event("keydown"));
  expect(touchSession).toHaveBeenCalledTimes(2);
});

test("stops touching once no longer active", async () => {
  const touchSession = vi
    .fn<() => Promise<SessionOutcome>>()
    .mockResolvedValue(okOutcome("2099-01-01T00:00:00.000Z"));
  const clock = createControllableClock();

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
  const clock = createControllableClock();

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
