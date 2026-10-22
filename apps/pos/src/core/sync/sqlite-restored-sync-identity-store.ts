import type {
  CarriedSyncIdentity,
  RestoredSyncIdentityStore,
  RestoredSyncIdentityTransaction,
} from "@purosur/domain/sync/use-cases";
import type { LocalDatabase } from "../platform/local-database";

interface CarriedRow {
  device_id: string | null;
  last_device_seq: number;
  first_unacknowledged_seq: number | null;
}

export class SqliteRestoredSyncIdentityStore implements RestoredSyncIdentityStore {
  private readonly database: LocalDatabase;

  constructor(database: LocalDatabase) {
    this.database = database;
  }

  async transaction<TOutcome>(
    work: (tx: RestoredSyncIdentityTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const outcome = await work(this.scope());
      this.database.exec("COMMIT");
      return outcome;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  private scope(): RestoredSyncIdentityTransaction {
    const database = this.database;
    return {
      async carriedIdentity(): Promise<CarriedSyncIdentity> {
        const row = database
          .prepare<[], CarriedRow>(
            `SELECT device_id, last_device_seq,
                    (SELECT MIN(device_seq) FROM outbox
                      WHERE device_id = sync_state.device_id AND acked_at IS NULL)
                      AS first_unacknowledged_seq
               FROM sync_state`,
          )
          .get();
        if (row?.device_id == null) {
          throw new Error("the restored database holds no installation");
        }
        return {
          deviceId: row.device_id,
          lastAcknowledgedSeq:
            row.first_unacknowledged_seq === null
              ? row.last_device_seq
              : row.first_unacknowledged_seq - 1,
        };
      },
      async recordPredecessor(predecessor) {
        database
          .prepare(
            "INSERT INTO register_predecessor (device_id, last_acknowledged_seq) VALUES (?, ?)",
          )
          .run(predecessor.deviceId, predecessor.lastAcknowledgedSeq);
      },
      async discardCarriedOutboxEvents() {
        database.exec("DELETE FROM outbox");
      },
      async adoptInstallationIdentity(deviceId) {
        database
          .prepare(
            `UPDATE sync_state SET
               device_id = ?, last_device_seq = 0, last_chain_hmac = NULL,
               installation_revoked_at = NULL, sales_stopped_reason = NULL,
               stale_sequence_detected_at = NULL, last_accepted_push_at = NULL`,
          )
          .run(deviceId);
      },
      async discardCarriedPinVerifiers() {
        database.exec("DELETE FROM pin_verifiers; DELETE FROM pin_sign_in_failures;");
      },
    };
  }
}
