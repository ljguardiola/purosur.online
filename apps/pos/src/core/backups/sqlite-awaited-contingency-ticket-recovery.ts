import type {
  AwaitedContingencyTicketRecovery,
  ContingencyTicketRecoveryPredecessor,
} from "@purosur/domain/backups/use-cases";
import type { LocalDatabase } from "../platform/local-database";

export class SqliteAwaitedContingencyTicketRecovery implements AwaitedContingencyTicketRecovery {
  private readonly database: LocalDatabase;

  constructor(database: LocalDatabase) {
    this.database = database;
  }

  async predecessor(): Promise<ContingencyTicketRecoveryPredecessor | undefined> {
    const row = this.database
      .prepare<[], { device_id: string; last_acknowledged_seq: number }>(
        "SELECT device_id, last_acknowledged_seq FROM awaiting_contingency_ticket_recovery",
      )
      .get();
    return row && { deviceId: row.device_id, lastAcknowledgedSeq: row.last_acknowledged_seq };
  }

  async release({
    deviceId,
    lastAcknowledgedSeq,
  }: ContingencyTicketRecoveryPredecessor): Promise<void> {
    this.database.transaction(() => {
      this.database.exec("DELETE FROM register_predecessor");
      this.database
        .prepare(
          "INSERT INTO register_predecessor (device_id, last_acknowledged_seq) VALUES (?, ?)",
        )
        .run(deviceId, lastAcknowledgedSeq);
      this.database.exec("DELETE FROM awaiting_contingency_ticket_recovery");
    })();
  }
}
