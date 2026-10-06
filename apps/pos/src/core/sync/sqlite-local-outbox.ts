import { PUSH_EVENTS_REQUEST_MAX_BYTES } from "@purosur/contracts";
import type { PushedEvent } from "@purosur/domain";
import type { LocalOutbox } from "@purosur/domain/sync/use-cases";
import type { LocalDatabase } from "../platform/local-database";

interface OutboxRow extends Omit<PushedEvent, "payload"> {
  payload: string;
}

const REQUEST_ENVELOPE_MARGIN_BYTES = 4096;
const EVENTS_BYTE_BUDGET = PUSH_EVENTS_REQUEST_MAX_BYTES - REQUEST_ENVELOPE_MARGIN_BYTES;

const CURRENT_INSTALLATION = "device_id = (SELECT device_id FROM sync_state)";

function withinByteBudget(events: PushedEvent[]): PushedEvent[] {
  let bytes = 0;
  const firstOver = events.findIndex((event) => {
    bytes += Buffer.byteLength(JSON.stringify(event));
    return bytes > EVENTS_BYTE_BUDGET;
  });
  return firstOver === -1 ? events : events.slice(0, Math.max(firstOver, 1));
}

export class SqliteLocalOutbox implements LocalOutbox {
  private readonly database: LocalDatabase;
  private readonly now: () => Date;

  constructor(database: LocalDatabase, now: () => Date) {
    this.database = database;
    this.now = now;
  }

  async unacknowledged(limit: number): Promise<PushedEvent[]> {
    const events = this.database
      .prepare<[number], OutboxRow>(
        `SELECT event_id, device_seq, aggregate_type, aggregate_id, event_type, schema_version,
                payload, occurred_at, actor_id, chain_hmac
           FROM outbox
          WHERE ${CURRENT_INSTALLATION} AND acked_at IS NULL
          ORDER BY device_seq
          LIMIT ?`,
      )
      .all(limit)
      .map((row): PushedEvent => ({ ...row, payload: JSON.parse(row.payload) }));
    return withinByteBudget(events);
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

  async holdsEvent(deviceSeq: number): Promise<boolean> {
    return (
      this.database
        .prepare<[number], { held: 1 }>(
          `SELECT 1 AS held FROM outbox WHERE ${CURRENT_INSTALLATION} AND device_seq = ?`,
        )
        .get(deviceSeq) !== undefined
    );
  }

  async holdsEventAfter(deviceSeq: number): Promise<boolean> {
    return (
      this.database
        .prepare<[number], { held: 1 }>(
          `SELECT 1 AS held FROM outbox WHERE ${CURRENT_INSTALLATION} AND device_seq > ? LIMIT 1`,
        )
        .get(deviceSeq) !== undefined
    );
  }

  async recordCompromised(): Promise<void> {
    this.database
      .prepare(
        "UPDATE sync_state SET installation_revoked_at = ? WHERE installation_revoked_at IS NULL",
      )
      .run(this.now().toISOString());
  }
}
