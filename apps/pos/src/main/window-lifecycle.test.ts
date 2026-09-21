import { describe, expect, it } from "vitest";
import {
  type RendererGoneReason,
  type RevivableWindow,
  showWhenReadyAndReviveRenderer,
} from "./window-lifecycle";

class FakeWindow implements RevivableWindow {
  shown = 0;
  reloads = 0;
  destroyed = false;
  private readyListener: (() => void) | undefined;
  private goneListener: ((reason: RendererGoneReason) => void) | undefined;

  readonly webContents = {
    onRendererGone: (listener: (reason: RendererGoneReason) => void) => {
      this.goneListener = listener;
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
}

describe("showWhenReadyAndReviveRenderer", () => {
  it("keeps the window hidden until its first paint is ready", () => {
    const window = new FakeWindow();

    showWhenReadyAndReviveRenderer(window);

    expect(window.shown).toBe(0);
  });

  it("shows the window once its first paint is ready", () => {
    const window = new FakeWindow();

    showWhenReadyAndReviveRenderer(window);
    window.becomeReady();

    expect(window.shown).toBe(1);
  });

  it.each(["crashed", "oom", "killed", "abnormal-exit"] as const)(
    "reloads the interface after its renderer process is gone (%s)",
    (reason) => {
      const window = new FakeWindow();

      showWhenReadyAndReviveRenderer(window);
      window.loseRenderer(reason);

      expect(window.reloads).toBe(1);
    },
  );

  it("does not reload after the renderer exits cleanly", () => {
    const window = new FakeWindow();

    showWhenReadyAndReviveRenderer(window);
    window.loseRenderer("clean-exit");

    expect(window.reloads).toBe(0);
  });

  it("does not reload a window that is already destroyed", () => {
    const window = new FakeWindow();

    showWhenReadyAndReviveRenderer(window);
    window.destroyed = true;
    window.loseRenderer("crashed");

    expect(window.reloads).toBe(0);
  });
});
