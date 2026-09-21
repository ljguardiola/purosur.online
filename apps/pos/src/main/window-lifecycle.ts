export type RendererGoneReason =
  | "clean-exit"
  | "abnormal-exit"
  | "killed"
  | "crashed"
  | "oom"
  | "launch-failed"
  | "integrity-failure"
  | "memory-eviction";

export interface RevivableWindow {
  onceReadyToShow(listener: () => void): void;
  show(): void;
  isDestroyed(): boolean;
  webContents: {
    onRendererGone(listener: (reason: RendererGoneReason) => void): void;
    reload(): void;
  };
}

// The window is created hidden so it never flashes an empty frame, and a crashed interface comes
// back by itself: its reload reconnects to the core like any other page load.
export function showWhenReadyAndReviveRenderer(window: RevivableWindow): void {
  window.onceReadyToShow(() => window.show());
  window.webContents.onRendererGone((reason) => {
    if (reason === "clean-exit" || window.isDestroyed()) {
      return;
    }
    window.webContents.reload();
  });
}
