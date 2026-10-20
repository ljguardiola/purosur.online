import type { SnapshotWorkerMessage } from "@purosur/contracts";
import type { RestoreNewestSnapshotGenerationOutcome } from "@purosur/domain/backups/use-cases";

export function endRestoreWorker(
  outcome: RestoreNewestSnapshotGenerationOutcome,
  deps: { post: (message: SnapshotWorkerMessage) => void },
): void {
  deps.post({ type: "snapshot-restore-finished", outcome: outcome.kind });
}
