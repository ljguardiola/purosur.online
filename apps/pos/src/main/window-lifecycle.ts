import { decideRestart, type RestartPolicy } from "./core-supervisor";

export type RendererGoneReason =
  | "clean-exit"
  | "abnormal-exit"
  | "killed"
  | "crashed"
  | "oom"
  | "launch-failed"
  | "integrity-failure"
  | "memory-eviction";

export interface LoadFailure {
  code: number;
  description: string;
}

export interface RevivableWindow {
  onceReadyToShow(listener: () => void): void;
  show(): void;
  isDestroyed(): boolean;
  webContents: {
    onRendererGone(listener: (reason: RendererGoneReason) => void): void;
    onLoadFailed(listener: (failure: LoadFailure) => void): void;
    reload(): void;
  };
}

export interface RendererRecoveryDeps {
  scheduleReload(run: () => void, delayMs: number): void;
  now(): number;
  policy: RestartPolicy;
  onRecoveryExhausted?(): void;
  onLoadFailed?(failure: LoadFailure): void;
}

// The window is created hidden so it never flashes an empty frame, and a crashed interface comes
// back by itself, under the same backoff and attempt limit as the core: its reload reconnects to
// the core like any other page load.
export function showWhenReadyAndReviveRenderer(
  window: RevivableWindow,
  deps: RendererRecoveryDeps,
): void {
  let attempt = 0;
  let loadedAt = deps.now();

  window.onceReadyToShow(() => window.show());
  // A page that fails to load never becomes ready to show, which would leave the register with no
  // window at all.
  window.webContents.onLoadFailed((failure) => {
    window.show();
    deps.onLoadFailed?.(failure);
  });
  window.webContents.onRendererGone((reason) => {
    if (reason === "clean-exit" || window.isDestroyed()) {
      return;
    }

    if (deps.now() - loadedAt >= deps.policy.stableRunMs) {
      attempt = 0;
    }

    const decision = decideRestart(attempt, deps.policy);
    attempt += 1;

    if (!decision.shouldRestart) {
      deps.onRecoveryExhausted?.();
      return;
    }

    deps.scheduleReload(() => {
      if (window.isDestroyed()) {
        return;
      }
      loadedAt = deps.now();
      window.webContents.reload();
    }, decision.delayMs);
  });
}
