import type { RestoreFirstInstallation, SnapshotRestoreOutcomeKind } from "@purosur/contracts";
import type { RestorePending } from "./restore-pending";

export interface RestoreAttemptsDeps {
  pending: RestorePending;
  launch: () => Promise<boolean>;
  restartCore: () => void;
  resumeSync: () => void;
  reportNoUsableGeneration: () => void;
  cloudAnswered: (reachable: boolean) => void;
  resetWithoutCopy: (firstInstallation: RestoreFirstInstallation) => Promise<void>;
}

export interface RestoreAttempts {
  attempt(): Promise<void>;
  workerExited(
    outcome: SnapshotRestoreOutcomeKind | undefined,
    firstInstallation?: RestoreFirstInstallation,
  ): Promise<void>;
  noUsableGeneration(): boolean;
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
    async workerExited(outcome, firstInstallation) {
      running = false;
      if (outcome !== undefined) {
        deps.cloudAnswered(outcome !== "unreachable");
      }
      if (outcome === "restored") {
        deps.restartCore();
      } else if (outcome === "no_generation") {
        if (firstInstallation !== undefined) {
          await deps.resetWithoutCopy(firstInstallation);
        }
        deps.pending.clear();
        deps.resumeSync();
      } else if (outcome === "none_usable") {
        noneUsable = true;
        deps.reportNoUsableGeneration();
      }
    },
    noUsableGeneration: () => noneUsable,
  };
}
