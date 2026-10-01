import type { PushedEvent } from "@purosur/domain";
import type { LocalOutbox } from "@purosur/domain/sync/use-cases";
import type { LocalDatabase } from "../platform/local-database";

interface OutboxRow extends Omit<PushedEvent, "payload"> {
  payload: string;
}

const CURRENT_INSTALLATION = "device_id = (SELECT device_id FROM sync_state)";

export class SqliteLocalOutbox implements LocalOutbox {
  private readonly database: LocalDatabase;
  private readonly now: () => Date;

  constructor(database: LocalDatabase, now: () => Date) {
    this.database = database;
    this.now = now;
  }

  async unacknowledged(limit: number): Promise<PushedEvent[]> {
    return this.database
      .prepare<[number], OutboxRow>(
        `SELECT event_id, device_seq, aggregate_type, aggregate_id, event_type, schema_version,
                payload, occurred_at, actor_id, chain_hmac
           FROM outbox
          WHERE ${CURRENT_INSTALLATION} AND acked_at IS NULL
          ORDER BY device_seq
          LIMIT ?`,
      )
      .all(limit)
      .map((row) => ({ ...row, payload: JSON.parse(row.payload) }));
  }

  async acknowledgeThrough(deviceSeq: number): Promise<void> {
    this.database
      .prepare(
        `UPDATE outbox SET acked_at = ?
          WHERE ${CURRENT_INSTALLATION} AND acked_at IS NULL AND device_seq <= ?`,
      )
      .run(this.now().toISOString(), deviceSeq);
  }

  async resendFrom(deviceSeq: number): Promise<void> {
    this.database
      .prepare(
        `UPDATE outbox SET acked_at = NULL
          WHERE ${CURRENT_INSTALLATION} AND device_seq >= ?`,
      )
      .run(deviceSeq);
  }
}
