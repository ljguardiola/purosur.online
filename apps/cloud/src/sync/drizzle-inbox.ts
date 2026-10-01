import type { PushedEvent } from "@purosur/domain";
import type { Inbox, InboxTransaction, PushReport } from "@purosur/domain/sync/use-cases";
import { and, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { deviceState, inbox, registerInstallations } from "../platform/db/schema.js";

class DrizzleInboxTransaction<TQueryResult extends PgQueryResultHKT> implements InboxTransaction {
  private readonly tx: PgDatabase<TQueryResult>;

  constructor(tx: PgDatabase<TQueryResult>) {
    this.tx = tx;
  }

  async lockDevice(deviceId: string): Promise<void> {
    await this.tx
      .select({ id: registerInstallations.id })
      .from(registerInstallations)
      .where(eq(registerInstallations.id, deviceId))
      .for("no key update");
  }

  async receivedDeviceSeqs(deviceId: string): Promise<number[]> {
    const rows = await this.tx
      .select({ deviceSeq: inbox.deviceSeq })
      .from(inbox)
      .where(eq(inbox.deviceId, deviceId));
    return rows.map((row) => row.deviceSeq);
  }

  async receivedEventIds(
    deviceId: string,
    deviceSeqs: readonly number[],
  ): Promise<ReadonlyMap<number, string>> {
    if (deviceSeqs.length === 0) {
      return new Map();
    }
    const rows = await this.tx
      .select({ deviceSeq: inbox.deviceSeq, eventId: inbox.eventId })
      .from(inbox)
      .where(and(eq(inbox.deviceId, deviceId), inArray(inbox.deviceSeq, [...deviceSeqs])));
    return new Map(rows.map(({ deviceSeq, eventId }) => [deviceSeq, eventId]));
  }

  async receive(deviceId: string, events: readonly PushedEvent[], receivedAt: Date): Promise<void> {
    if (events.length === 0) {
      return;
    }
    await this.tx.insert(inbox).values(
      events.map((event) => ({
        eventId: event.event_id,
        deviceId,
        deviceSeq: event.device_seq,
        aggregateType: event.aggregate_type,
        aggregateId: event.aggregate_id,
        eventType: event.event_type,
        schemaVersion: event.schema_version,
        payload: event.payload,
        occurredAt: new Date(event.occurred_at),
        actorId: event.actor_id,
        chainHmac: event.chain_hmac,
        receivedAt,
      })),
    );
  }

  async recordPushReport(deviceId: string, report: PushReport, at: Date): Promise<void> {
    const { appVersion, telemetry } = report;
    const pushed = {
      appVersion,
      lastPushedAt: at,
      walSizeBytes: telemetry.wal_size_bytes,
      diskFreeBytes: telemetry.disk_free_bytes,
      diskFreeRatio: telemetry.disk_free_ratio,
    };
    await this.tx
      .insert(deviceState)
      .values({ deviceId, ...pushed })
      .onConflictDoUpdate({ target: deviceState.deviceId, set: pushed });
  }
}

export class DrizzleInbox<TQueryResult extends PgQueryResultHKT> implements Inbox {
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  // Read committed. Every push of an installation first takes its installation row, in a mode that
  // does not block the foreign keys of what it stores, so a second push reads the inbox only once
  // the first one committed and cannot insert the same seq twice.
  transaction<TOutcome>(work: (tx: InboxTransaction) => Promise<TOutcome>): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzleInboxTransaction(tx)));
  }
}
