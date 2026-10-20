import type { SnapshotRestoreOutcomeKind } from "@purosur/contracts";
import type { RestorePending } from "./restore-pending";

export interface RestoreAttemptsDeps {
  pending: RestorePending;
  launch: () => Promise<boolean>;
  restartCore: () => void;
  resumeSync: () => void;
  reportNoUsableGeneration: () => void;
}

export interface RestoreAttempts {
  attempt(): Promise<void>;
  workerExited(outcome: SnapshotRestoreOutcomeKind | undefined): void;
}

export function createRestoreAttempts(deps: RestoreAttemptsDeps): RestoreAttempts {
  let running = false;
  let noneUsable = false;

  return {
    async attempt() {
      if (running || noneUsable || !deps.pending.isPending()) {
        return;
      }
      running = true;
      let launched = false;
      try {
        launched = await deps.launch();
      } finally {
        running = launched;
      }
    },
    workerExited(outcome) {
      running = false;
      if (outcome === "restored") {
        deps.restartCore();
      } else if (outcome === "no_generation") {
        deps.pending.clear();
        deps.resumeSync();
      } else if (outcome === "none_usable") {
        noneUsable = true;
        deps.reportNoUsableGeneration();
      }
    },
  };
}
