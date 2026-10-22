import type { RestorationEvidence } from "@purosur/domain";
import type { RestorationProtocolEvidence } from "@purosur/domain/register/use-cases";
import type { RestorePending } from "../backups/restore-pending";
import type { LocalDatabase } from "../platform/local-database";
import { staleSequenceDetected } from "../sync/sqlite-installation-presence";

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
      enroll: staleSequenceDetected(this.database) && !restoring ? "pending" : "completed",
      restore: restoring ? "pending" : "completed",
      reset_sync_identity: restoring ? "pending" : "completed",
      replenish: this.holdsPredecessor() ? "pending" : "completed",
      reconcile_fiscal_counters: this.awaitsNumbering() ? "pending" : "completed",
    };
  }

  private awaitsNumbering(): boolean {
    return (
      this.database
        .prepare<[], { awaiting: 1 }>(
          "SELECT 1 AS awaiting FROM register_point_of_sale WHERE awaiting_restored_numbering = 1 LIMIT 1",
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
