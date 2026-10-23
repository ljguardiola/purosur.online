import type { SnapshotWorkerMessage } from "@purosur/contracts";
import type { RestoreNewestSnapshotGenerationOutcome } from "@purosur/domain/backups/use-cases";

export function endRestoreWorker(
  outcome: RestoreNewestSnapshotGenerationOutcome,
  deps: { post: (message: SnapshotWorkerMessage) => void },
): void {
  if (outcome.kind === "no_generation" && outcome.firstInstallation !== undefined) {
    deps.post({
      type: "snapshot-restore-finished",
      outcome: outcome.kind,
      first_installation: {
        installation_id: outcome.firstInstallation.installationId,
        register_id: outcome.firstInstallation.registerId,
      },
    });
    return;
  }
  deps.post({ type: "snapshot-restore-finished", outcome: outcome.kind });
}
