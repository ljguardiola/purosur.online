import type { PushedEvent } from "@purosur/domain";
import type {
  HeldEvent,
  HeldEventPosition,
  Inbox,
  InboxTransaction,
  PushReport,
} from "@purosur/domain/sync/use-cases";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { deviceState, inbox, refusedEvents, registerInstallations } from "../platform/db/schema.js";
import type { InstallationKeyCipher } from "../register/installation-key-cipher.js";
import { readOutboxChainKey } from "../register/outbox-chain-key.js";
import type { EnqueueEventApplication } from "./graphile-event-application-queue.js";

class DrizzleInboxTransaction<TQueryResult extends PgQueryResultHKT> implements InboxTransaction {
  private readonly tx: PgDatabase<TQueryResult>;
  private readonly cipher: InstallationKeyCipher;
  private readonly enqueueApplication: EnqueueEventApplication;

  constructor(
    tx: PgDatabase<TQueryResult>,
    cipher: InstallationKeyCipher,
    enqueueApplication: EnqueueEventApplication,
  ) {
    this.tx = tx;
    this.cipher = cipher;
    this.enqueueApplication = enqueueApplication;
  }

  async lockDevice(deviceId: string): Promise<void> {
    await this.tx
      .select({ id: registerInstallations.id })
      .from(registerInstallations)
      .where(eq(registerInstallations.id, deviceId))
      .for("no key update");
  }

  async installationRevoked(deviceId: string): Promise<boolean> {
    const [row] = await this.tx
      .select({ revokedAt: registerInstallations.revokedAt })
      .from(registerInstallations)
      .where(eq(registerInstallations.id, deviceId));
    return row?.revokedAt != null;
  }

  async receivedDeviceSeqs(deviceId: string): Promise<number[]> {
    const rows = await this.tx
      .select({ deviceSeq: inbox.deviceSeq })
      .from(inbox)
      .where(eq(inbox.deviceId, deviceId));
    return rows.map((row) => row.deviceSeq);
  }

  async receivedEventsAt(
    deviceId: string,
    deviceSeqs: readonly number[],
  ): Promise<ReadonlyMap<number, HeldEvent>> {
    if (deviceSeqs.length === 0) {
      return new Map();
    }
    const rows = await this.tx
      .select({ deviceSeq: inbox.deviceSeq, eventId: inbox.eventId, chainHmac: inbox.chainHmac })
      .from(inbox)
      .where(and(eq(inbox.deviceId, deviceId), inArray(inbox.deviceSeq, [...deviceSeqs])));
    return new Map(
      rows.map(({ deviceSeq, eventId, chainHmac }) => [deviceSeq, { eventId, chainHmac }]),
    );
  }

  async receivedEventPositions(
    eventIds: readonly string[],
  ): Promise<ReadonlyMap<string, HeldEventPosition>> {
    if (eventIds.length === 0) {
      return new Map();
    }
    const rows = await this.tx
      .select({ eventId: inbox.eventId, deviceId: inbox.deviceId, deviceSeq: inbox.deviceSeq })
      .from(inbox)
      .where(inArray(inbox.eventId, [...eventIds]));
    return new Map(
      rows.map(({ eventId, deviceId, deviceSeq }) => [eventId, { deviceId, deviceSeq }]),
    );
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
    await this.enqueueApplication(this.tx);
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

  outboxChainKey(deviceId: string): Promise<string | undefined> {
    return readOutboxChainKey(this.tx, this.cipher, deviceId);
  }

  async receivedChainLink(deviceId: string, deviceSeq: number): Promise<string | undefined> {
    const [row] = await this.tx
      .select({ chainHmac: inbox.chainHmac })
      .from(inbox)
      .where(and(eq(inbox.deviceId, deviceId), eq(inbox.deviceSeq, deviceSeq)));
    return row?.chainHmac;
  }

  async setAsideRefusedPush(
    deviceId: string,
    events: readonly PushedEvent[],
    refusedAt: Date,
  ): Promise<void> {
    await this.tx.insert(refusedEvents).values(
      events.map((event) => ({
        deviceId,
        eventId: event.event_id,
        deviceSeq: event.device_seq,
        aggregateType: event.aggregate_type,
        aggregateId: event.aggregate_id,
        eventType: event.event_type,
        schemaVersion: event.schema_version,
        payload: event.payload,
        occurredAt: new Date(event.occurred_at),
        actorId: event.actor_id,
        chainHmac: event.chain_hmac,
        refusedAt,
      })),
    );
  }

  async revokeForBrokenChain(deviceId: string, revokedAt: Date): Promise<void> {
    await this.tx
      .update(registerInstallations)
      .set({ revokedAt, revocationReason: "outbox_chain_broken" })
      .where(and(eq(registerInstallations.id, deviceId), isNull(registerInstallations.revokedAt)));
  }
}

export class DrizzleInbox<TQueryResult extends PgQueryResultHKT> implements Inbox {
  private readonly db: PgDatabase<TQueryResult>;
  private readonly cipher: InstallationKeyCipher;
  private readonly enqueueApplication: EnqueueEventApplication;

  constructor(
    db: PgDatabase<TQueryResult>,
    cipher: InstallationKeyCipher,
    enqueueApplication: EnqueueEventApplication,
  ) {
    this.db = db;
    this.cipher = cipher;
    this.enqueueApplication = enqueueApplication;
  }

  // Read committed. Every push of an installation first takes its installation row, in a mode that
  // does not block the foreign keys of what it stores, so a second push reads the inbox only once
  // the first one committed and cannot insert the same seq twice.
  transaction<TOutcome>(work: (tx: InboxTransaction) => Promise<TOutcome>): Promise<TOutcome> {
    return this.db.transaction((tx) =>
      work(new DrizzleInboxTransaction(tx, this.cipher, this.enqueueApplication)),
    );
  }
}
