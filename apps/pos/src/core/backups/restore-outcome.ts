import type { SnapshotRestoreOutcomeKind } from "@purosur/contracts";
import type { RestorePending } from "./restore-pending";

export interface RestoreOutcomeDeps {
  pending: RestorePending;
  restartCore: () => void;
  resumeSync: () => void;
  reportNoUsableGeneration: () => void;
}

export function handleRestoreOutcome(
  outcome: SnapshotRestoreOutcomeKind | undefined,
  deps: RestoreOutcomeDeps,
): void {
  if (outcome === "restored") {
    deps.restartCore();
  } else if (outcome === "no_generation") {
    deps.pending.clear();
    deps.resumeSync();
  } else if (outcome === "none_usable") {
    deps.reportNoUsableGeneration();
  }
}
