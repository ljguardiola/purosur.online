import type {
  AggregateKey,
  HeldEventRecord,
  QuarantineRelease,
  QuarantineReleaseRecord,
  QuarantineReleaseTransaction,
} from "@purosur/domain/sync/use-cases";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { openAlertCondition } from "../alerts/open-alert-condition.js";
import { resolveAlert } from "../alerts/resolve-alert.js";
import {
  alerts,
  auditLog,
  inbox,
  registerInstallations,
  registers,
} from "../platform/db/schema.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

class DrizzleQuarantineReleaseTransaction<TQueryResult extends PgQueryResultHKT>
  implements QuarantineReleaseTransaction
{
  private readonly tx: Transaction<TQueryResult>;

  constructor(tx: Transaction<TQueryResult>) {
    this.tx = tx;
  }

  async aggregateOfEventInBranch(
    eventId: string,
    locationId: string,
  ): Promise<AggregateKey | undefined> {
    const [row] = await this.tx
      .select({ aggregateType: inbox.aggregateType, aggregateId: inbox.aggregateId })
      .from(inbox)
      .innerJoin(registerInstallations, eq(registerInstallations.id, inbox.deviceId))
      .innerJoin(registers, eq(registers.id, registerInstallations.registerId))
      .where(and(eq(inbox.eventId, eventId), eq(registers.locationId, locationId)));
    return row;
  }

  async lockAggregateWaiting({ aggregateType, aggregateId }: AggregateKey): Promise<void> {
    await this.tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(json_build_array(${aggregateType}::text, ${aggregateId}::text)::text, 0))`,
    );
  }

  async lockEvent(eventId: string): Promise<HeldEventRecord | undefined> {
    const [row] = await this.tx
      .select({
        appliedAt: inbox.appliedAt,
        quarantinedAt: inbox.quarantinedAt,
        nextAttemptAt: inbox.nextAttemptAt,
        attempts: inbox.attempts,
        lastError: inbox.lastError,
      })
      .from(inbox)
      .where(eq(inbox.eventId, eventId))
      .for("update");
    return row;
  }

  async releaseForNewSeries(
    eventId: string,
    released: QuarantineReleaseRecord["released"],
  ): Promise<void> {
    await this.tx.update(inbox).set(released).where(eq(inbox.eventId, eventId));
  }

  async recordRelease(release: QuarantineReleaseRecord): Promise<void> {
    await this.tx.insert(auditLog).values({
      entity: "synced_event",
      entityId: release.eventId,
      actorId: release.releasedBy,
      at: release.releasedAt,
      previousValue: {
        ...release.previous,
        quarantinedAt: release.previous.quarantinedAt?.toISOString() ?? null,
      },
      newValue: release.released,
    });
  }

  async resolveQuarantineAlert(eventId: string, resolvedAt: Date): Promise<void> {
    const [alert] = await this.tx
      .select({ id: alerts.id })
      .from(alerts)
      .where(
        and(eq(alerts.kind, "events_quarantined"), eq(alerts.scope, eventId), openAlertCondition()),
      )
      .for("update");
    if (alert) {
      await resolveAlert(this.tx, alert.id, { now: () => resolvedAt });
    }
  }
}

export class DrizzleQuarantineRelease<TQueryResult extends PgQueryResultHKT>
  implements QuarantineRelease
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<T>(work: (tx: QuarantineReleaseTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(new DrizzleQuarantineReleaseTransaction(tx)));
  }
}
