import type { RestorationEvidence } from "@purosur/domain";
import type { RestorationProtocolEvidence } from "@purosur/domain/register/use-cases";
import type { RestorePending } from "../backups/restore-pending";
import type { LocalDatabase } from "../platform/local-database";

export class SqliteRestorationEvidence implements RestorationProtocolEvidence {
  private readonly database: LocalDatabase;
  private readonly restorePending: RestorePending;

  constructor(database: LocalDatabase, restorePending: RestorePending) {
    this.database = database;
    this.restorePending = restorePending;
  }

  evidence(): RestorationEvidence {
    const restoring = this.restorePending.isPending();
    return {
      enroll: this.staleSequenceDetected() && !restoring ? "pending" : "completed",
      restore: restoring ? "pending" : "completed",
      reset_sync_identity: restoring ? "pending" : "completed",
      replenish: this.holdsPredecessor() ? "pending" : "completed",
    };
  }

  private staleSequenceDetected(): boolean {
    return (
      this.database
        .prepare<[], { detected: 1 }>(
          "SELECT 1 AS detected FROM sync_state WHERE stale_sequence_detected_at IS NOT NULL",
        )
        .get() !== undefined
    );
  }

  private holdsPredecessor(): boolean {
    return (
      this.database
        .prepare<[], { held: 1 }>("SELECT 1 AS held FROM register_predecessor LIMIT 1")
        .get() !== undefined
    );
  }
}
