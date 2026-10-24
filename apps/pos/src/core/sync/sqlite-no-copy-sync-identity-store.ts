import type {
  NoCopySyncIdentityStore,
  NoCopySyncIdentityTransaction,
} from "@purosur/domain/sync/use-cases";
import type { LocalDatabase } from "../platform/local-database";

export class SqliteNoCopySyncIdentityStore implements NoCopySyncIdentityStore {
  private readonly database: LocalDatabase;

  constructor(database: LocalDatabase) {
    this.database = database;
  }

  async transaction<TOutcome>(
    work: (tx: NoCopySyncIdentityTransaction) => Promise<TOutcome>,
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

  private scope(): NoCopySyncIdentityTransaction {
    const database = this.database;
    return {
      async heldDeviceId() {
        const row = database
          .prepare<[], { device_id: string | null }>("SELECT device_id FROM sync_state")
          .get();
        return row?.device_id ?? undefined;
      },
      async recordPredecessor(predecessor) {
        database.exec("DELETE FROM register_predecessor");
        database
          .prepare(
            "INSERT INTO register_predecessor (device_id, last_acknowledged_seq) VALUES (?, ?)",
          )
          .run(predecessor.deviceId, predecessor.lastAcknowledgedSeq);
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
      async awaitRestoredNumbering(registerId) {
        database
          .prepare("INSERT OR IGNORE INTO awaiting_restored_numbering (register_id) VALUES (?)")
          .run(registerId);
        database
          .prepare(
            "INSERT OR IGNORE INTO awaiting_orphan_sweep (register_id, from_copy) VALUES (?, 0)",
          )
          .run(registerId);
      },
    };
  }
}
