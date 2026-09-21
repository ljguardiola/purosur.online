import { describe, expect, it, vi } from "vitest";
import {
  type LoadFailure,
  type RendererGoneReason,
  type RendererRecoveryDeps,
  type RevivableWindow,
  showWhenReadyAndReviveRenderer,
} from "./window-lifecycle";

const policy = { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1000, stableRunMs: 60_000 };

class FakeWindow implements RevivableWindow {
  shown = 0;
  reloads = 0;
  destroyed = false;
  private readyListener: (() => void) | undefined;
  private goneListener: ((reason: RendererGoneReason) => void) | undefined;
  private loadFailedListener: ((failure: LoadFailure) => void) | undefined;

  readonly webContents = {
    onRendererGone: (listener: (reason: RendererGoneReason) => void) => {
      this.goneListener = listener;
    },
    onLoadFailed: (listener: (failure: LoadFailure) => void) => {
      this.loadFailedListener = listener;
    },
    reload: () => {
      this.reloads += 1;
    },
  };

  onceReadyToShow(listener: () => void): void {
    this.readyListener = listener;
  }

  show(): void {
    this.shown += 1;
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  becomeReady(): void {
    this.readyListener?.();
  }

  loseRenderer(reason: RendererGoneReason): void {
    this.goneListener?.(reason);
  }

  failLoad(failure: LoadFailure): void {
    this.loadFailedListener?.(failure);
  }
}

function setUp() {
  const window = new FakeWindow();
  const pendingReloads: { run: () => void; delayMs: number }[] = [];
  let clock = 0;
  const onRecoveryExhausted = vi.fn();
  const onLoadFailed = vi.fn();
  const deps: RendererRecoveryDeps = {
    scheduleReload: (run, delayMs) => {
      pendingReloads.push({ run, delayMs });
    },
    now: () => clock,
    policy,
    onRecoveryExhausted,
    onLoadFailed,
  };
  showWhenReadyAndReviveRenderer(window, deps);
  return {
    window,
    pendingReloads,
    onRecoveryExhausted,
    onLoadFailed,
    advanceClock: (ms: number) => {
      clock += ms;
    },
    runPendingReload: () => {
      pendingReloads.shift()?.run();
    },
  };
}

describe("showWhenReadyAndReviveRenderer", () => {
  it("keeps the window hidden until its first paint is ready", () => {
    const { window } = setUp();

    expect(window.shown).toBe(0);
  });

  it("shows the window once its first paint is ready", () => {
    const { window } = setUp();

    window.becomeReady();

    expect(window.shown).toBe(1);
  });

  it("shows the window when its page fails to load, since it will never be ready to show", () => {
    const { window } = setUp();

    window.failLoad({ code: -6, description: "ERR_FILE_NOT_FOUND" });

    expect(window.shown).toBe(1);
  });

  it("reports a failed page load", () => {
    const { window, onLoadFailed } = setUp();

    window.failLoad({ code: -6, description: "ERR_FILE_NOT_FOUND" });

    expect(onLoadFailed).toHaveBeenCalledWith({ code: -6, description: "ERR_FILE_NOT_FOUND" });
  });

  it.each(["crashed", "oom", "killed", "abnormal-exit"] as const)(
    "reloads the interface after its renderer process is gone (%s)",
    (reason) => {
      const { window, runPendingReload } = setUp();

      window.loseRenderer(reason);
      runPendingReload();

      expect(window.reloads).toBe(1);
    },
  );

  it("waits for the backoff delay before reloading", () => {
    const { window, pendingReloads } = setUp();

    window.loseRenderer("crashed");

    expect(window.reloads).toBe(0);
    expect(pendingReloads.map((reload) => reload.delayMs)).toEqual([100]);
  });

  it("backs off further on each consecutive renderer failure", () => {
    const { window, pendingReloads } = setUp();
    const delays: number[] = [];

    for (let failure = 0; failure < 3; failure += 1) {
      window.loseRenderer("crashed");
      const reload = pendingReloads.shift();
      delays.push(reload?.delayMs ?? -1);
      reload?.run();
    }

    expect(delays).toEqual([100, 200, 400]);
    expect(window.reloads).toBe(3);
  });

  it("stops reloading and reports it once the attempts are exhausted", () => {
    const { window, pendingReloads, onRecoveryExhausted, runPendingReload } = setUp();

    for (let failure = 0; failure < 3; failure += 1) {
      window.loseRenderer("crashed");
      runPendingReload();
    }
    window.loseRenderer("crashed");

    expect(pendingReloads).toHaveLength(0);
    expect(window.reloads).toBe(3);
    expect(onRecoveryExhausted).toHaveBeenCalledOnce();
  });

  it("counts attempts from zero again after the interface stayed up for a stable run", () => {
    const { window, pendingReloads, onRecoveryExhausted, runPendingReload, advanceClock } = setUp();

    for (let failure = 0; failure < 3; failure += 1) {
      window.loseRenderer("crashed");
      runPendingReload();
    }
    advanceClock(policy.stableRunMs);
    window.loseRenderer("crashed");

    expect(onRecoveryExhausted).not.toHaveBeenCalled();
    expect(pendingReloads.map((reload) => reload.delayMs)).toEqual([100]);
  });

  it("keeps counting attempts when the interface dies before a stable run", () => {
    const { window, pendingReloads, runPendingReload, advanceClock } = setUp();

    window.loseRenderer("crashed");
    runPendingReload();
    advanceClock(policy.stableRunMs - 1);
    window.loseRenderer("crashed");

    expect(pendingReloads.map((reload) => reload.delayMs)).toEqual([200]);
  });

  it("does not reload after the renderer exits cleanly", () => {
    const { window, pendingReloads } = setUp();

    window.loseRenderer("clean-exit");

    expect(pendingReloads).toHaveLength(0);
    expect(window.reloads).toBe(0);
  });

  it("does not reload a window that is already destroyed", () => {
    const { window, pendingReloads } = setUp();

    window.destroyed = true;
    window.loseRenderer("crashed");

    expect(pendingReloads).toHaveLength(0);
    expect(window.reloads).toBe(0);
  });

  it("does not reload a window destroyed while its reload was pending", () => {
    const { window, runPendingReload } = setUp();

    window.loseRenderer("crashed");
    window.destroyed = true;
    runPendingReload();

    expect(window.reloads).toBe(0);
  });
});
