import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { renderHook } from "vitest-browser-react";
import { navigate } from "./router";
import {
  type SessionActivityReporterOptions,
  useSessionActivityReporter,
} from "./sessionActivityReporter";
import type { SessionOutcome } from "./sessionApi";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  const hook = await renderReporter({
    active: true,
    touchSession,
    onTouched: vi.fn(),
    onEnded: vi.fn(),
    throttleMs: 10,
  });
  hooks.push(hook);

  expect(touchSession).not.toHaveBeenCalled();
  await wait(20);
  window.dispatchEvent(new Event("pointerdown"));

  await expect.poll(() => touchSession.mock.calls.length).toBe(1);
});

test("collapses a burst of activity within the throttle window into a single touch", async () => {
  const touchSession = vi
    .fn<() => Promise<SessionOutcome>>()
    .mockResolvedValue(okOutcome("2099-01-01T00:00:00.000Z"));

  const hook = await renderReporter({
    active: true,
    touchSession,
    onTouched: vi.fn(),
    onEnded: vi.fn(),
    throttleMs: 30,
  });
  hooks.push(hook);

  await wait(40);
  window.dispatchEvent(new Event("pointerdown"));
  window.dispatchEvent(new KeyboardEvent("keydown"));
  window.dispatchEvent(new Event("wheel"));
  window.dispatchEvent(new Event("scroll"));
  window.dispatchEvent(new Event("touchstart"));

  await expect.poll(() => touchSession.mock.calls.length).toBe(1);
  await wait(15);
  expect(touchSession).toHaveBeenCalledTimes(1);
});

test("touches again once the throttle window passes", async () => {
  const touchSession = vi
    .fn<() => Promise<SessionOutcome>>()
    .mockResolvedValue(okOutcome("2099-01-01T00:00:00.000Z"));

  const hook = await renderReporter({
    active: true,
    touchSession,
    onTouched: vi.fn(),
    onEnded: vi.fn(),
    throttleMs: 25,
  });
  hooks.push(hook);

  await wait(30);
  window.dispatchEvent(new Event("pointerdown"));
  await expect.poll(() => touchSession.mock.calls.length).toBe(1);

  await wait(30);
  window.dispatchEvent(new Event("keydown"));
  await expect.poll(() => touchSession.mock.calls.length).toBe(2);
});

test("touches nothing when there is no activity at all", async () => {
  const touchSession = vi
    .fn<() => Promise<SessionOutcome>>()
    .mockResolvedValue(okOutcome("2099-01-01T00:00:00.000Z"));

  const hook = await renderReporter({
    active: true,
    touchSession,
    onTouched: vi.fn(),
    onEnded: vi.fn(),
    throttleMs: 10,
  });
  hooks.push(hook);

  await wait(40);

  expect(touchSession).not.toHaveBeenCalled();
});

test("never treats a resting or moving cursor alone as activity", async () => {
  const touchSession = vi
    .fn<() => Promise<SessionOutcome>>()
    .mockResolvedValue(okOutcome("2099-01-01T00:00:00.000Z"));

  const hook = await renderReporter({
    active: true,
    touchSession,
    onTouched: vi.fn(),
    onEnded: vi.fn(),
    throttleMs: 10,
  });
  hooks.push(hook);

  await wait(20);
  window.dispatchEvent(new Event("mousemove"));
  window.dispatchEvent(new Event("pointermove"));
  await wait(10);

  expect(touchSession).not.toHaveBeenCalled();
});

test("touches nothing while the document is hidden", async () => {
  const touchSession = vi
    .fn<() => Promise<SessionOutcome>>()
    .mockResolvedValue(okOutcome("2099-01-01T00:00:00.000Z"));

  await withVisibilityState("hidden", async () => {
    const hook = await renderReporter({
      active: true,
      touchSession,
      onTouched: vi.fn(),
      onEnded: vi.fn(),
      throttleMs: 10,
    });
    hooks.push(hook);

    await wait(20);
    window.dispatchEvent(new Event("pointerdown"));
    await wait(10);

    expect(touchSession).not.toHaveBeenCalled();
  });
});

test("counts an in-app navigation as activity", async () => {
  const touchSession = vi
    .fn<() => Promise<SessionOutcome>>()
    .mockResolvedValue(okOutcome("2099-01-01T00:00:00.000Z"));

  const hook = await renderReporter({
    active: true,
    touchSession,
    onTouched: vi.fn(),
    onEnded: vi.fn(),
    throttleMs: 10,
  });
  hooks.push(hook);

  await wait(20);
  navigate("/help", { replace: true });

  await expect.poll(() => touchSession.mock.calls.length).toBe(1);
});

test("ends the session when a touch finds it no longer open", async () => {
  const touchSession = vi.fn<() => Promise<SessionOutcome>>().mockResolvedValue({
    kind: "unauthenticated",
  });
  const onEnded = vi.fn();

  const hook = await renderReporter({
    active: true,
    touchSession,
    onTouched: vi.fn(),
    onEnded,
    throttleMs: 10,
  });
  hooks.push(hook);

  await wait(20);
  window.dispatchEvent(new Event("pointerdown"));

  await expect.poll(() => onEnded.mock.calls.length).toBe(1);
});

test("hands the new expiresAt to onTouched after a successful touch", async () => {
  const touchSession = vi
    .fn<() => Promise<SessionOutcome>>()
    .mockResolvedValue(okOutcome("2099-06-01T00:00:00.000Z"));
  const onTouched = vi.fn();

  const hook = await renderReporter({
    active: true,
    touchSession,
    onTouched,
    onEnded: vi.fn(),
    throttleMs: 10,
  });
  hooks.push(hook);

  await wait(20);
  window.dispatchEvent(new Event("pointerdown"));

  await expect.poll(() => onTouched.mock.calls.length).toBe(1);
  expect(onTouched).toHaveBeenCalledWith("2099-06-01T00:00:00.000Z");
});

test("leaves the tab signed in when a touch only finds network trouble or a rate limit", async () => {
  const touchSession = vi
    .fn<() => Promise<SessionOutcome>>()
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 60 });
  const onEnded = vi.fn();
  const onTouched = vi.fn();

  const hook = await renderReporter({
    active: true,
    touchSession,
    onTouched,
    onEnded,
    throttleMs: 10,
  });
  hooks.push(hook);

  await wait(20);
  window.dispatchEvent(new Event("pointerdown"));

  await expect.poll(() => touchSession.mock.calls.length).toBe(1);
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

  const hook = await renderReporter({
    active: true,
    touchSession,
    onTouched: vi.fn(),
    onEnded: vi.fn(),
    throttleMs: 10,
  });
  hooks.push(hook);

  await wait(20);
  window.dispatchEvent(new Event("pointerdown"));
  await expect.poll(() => touchSession.mock.calls.length).toBe(1);

  window.dispatchEvent(new Event("keydown"));
  await wait(30);
  expect(touchSession).toHaveBeenCalledTimes(1);

  resolveFirst?.();
  await wait(15);
  window.dispatchEvent(new Event("keydown"));

  await expect.poll(() => touchSession.mock.calls.length).toBeGreaterThan(1);
});

test("stops touching once no longer active", async () => {
  const touchSession = vi
    .fn<() => Promise<SessionOutcome>>()
    .mockResolvedValue(okOutcome("2099-01-01T00:00:00.000Z"));

  const hook = await renderReporter({
    active: true,
    touchSession,
    onTouched: vi.fn(),
    onEnded: vi.fn(),
    throttleMs: 10,
  });
  hooks.push(hook);

  await wait(20);
  await hook.rerender({
    active: false,
    touchSession,
    onTouched: vi.fn(),
    onEnded: vi.fn(),
    throttleMs: 10,
  });
  window.dispatchEvent(new Event("pointerdown"));
  await wait(15);

  expect(touchSession).not.toHaveBeenCalled();
});

test("stops touching once the component unmounts", async () => {
  const touchSession = vi
    .fn<() => Promise<SessionOutcome>>()
    .mockResolvedValue(okOutcome("2099-01-01T00:00:00.000Z"));

  const hook = await renderReporter({
    active: true,
    touchSession,
    onTouched: vi.fn(),
    onEnded: vi.fn(),
    throttleMs: 10,
  });

  await wait(20);
  await hook.unmount();
  window.dispatchEvent(new Event("pointerdown"));
  await wait(15);

  expect(touchSession).not.toHaveBeenCalled();
});
