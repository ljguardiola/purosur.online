import type { AlertDetails } from "@purosur/domain";
import type {
  AggregateKey,
  EventApplication,
  EventApplicationTransaction,
  FailedAttempt,
  SyncedFact,
  UnappliedEvent,
} from "@purosur/domain/sync/use-cases";
import { and, asc, eq, isNull, min, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { openAlert } from "../alerts/open-alert.js";
import { inbox, registerInstallations, registers } from "../platform/db/schema.js";
import {
  type AppliedOrigin,
  closeAppliedCashSession,
  openAppliedCashSession,
  recordAppliedCashMovement,
} from "../register/drizzle-applied-cash-sessions.js";
import { recordAppliedSale } from "../sales/drizzle-applied-sales.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

class DrizzleEventApplicationTransaction<TQueryResult extends PgQueryResultHKT>
  implements EventApplicationTransaction
{
  private readonly tx: Transaction<TQueryResult>;
  private readonly now: () => Date;

  constructor(tx: Transaction<TQueryResult>, now: () => Date) {
    this.tx = tx;
    this.now = now;
  }

  async lockAggregate({ aggregateType, aggregateId }: AggregateKey): Promise<void> {
    await this.tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(json_build_array(${aggregateType}::text, ${aggregateId}::text)::text, 0))`,
    );
  }

  async unappliedEventsOf({ aggregateType, aggregateId }: AggregateKey): Promise<UnappliedEvent[]> {
    return this.tx
      .select({
        eventId: inbox.eventId,
        deviceId: inbox.deviceId,
        deviceSeq: inbox.deviceSeq,
        aggregateType: inbox.aggregateType,
        aggregateId: inbox.aggregateId,
        eventType: inbox.eventType,
        schemaVersion: inbox.schemaVersion,
        payload: inbox.payload,
        occurredAt: inbox.occurredAt,
        receivedAt: inbox.receivedAt,
        actorId: inbox.actorId,
        attempts: inbox.attempts,
        quarantinedAt: inbox.quarantinedAt,
        nextAttemptAt: inbox.nextAttemptAt,
      })
      .from(inbox)
      .where(
        and(
          eq(inbox.aggregateType, aggregateType),
          eq(inbox.aggregateId, aggregateId),
          isNull(inbox.appliedAt),
        ),
      );
  }

  async aggregateApplied({ aggregateType, aggregateId }: AggregateKey): Promise<boolean> {
    const rows = await this.tx
      .select({ eventId: inbox.eventId })
      .from(inbox)
      .where(
        and(
          eq(inbox.aggregateType, aggregateType),
          eq(inbox.aggregateId, aggregateId),
          sql`${inbox.appliedAt} is not null`,
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async record(fact: SyncedFact, event: UnappliedEvent): Promise<void> {
    switch (fact.kind) {
      case "cash_session_opened":
        return openAppliedCashSession(this.tx, await this.originOf(event), fact);
      case "cash_session_closed":
        return closeAppliedCashSession(this.tx, fact);
      case "cash_movement_recorded":
        return recordAppliedCashMovement(this.tx, event.eventId, fact);
      case "sale_completed":
        return recordAppliedSale(this.tx, await this.originOf(event), fact, this.now());
      case "fiscal_gate_failed":
        return;
    }
  }

  async markApplied(eventId: string, at: Date): Promise<void> {
    await this.tx.update(inbox).set({ appliedAt: at }).where(eq(inbox.eventId, eventId));
  }

  async recordFailedAttempt(eventId: string, failed: FailedAttempt): Promise<void> {
    const { error, ...attempt } = failed;
    await this.tx
      .update(inbox)
      .set({ ...attempt, lastError: error })
      .where(eq(inbox.eventId, eventId));
  }

  async openQuarantineAlert(details: AlertDetails["events_quarantined"]): Promise<void> {
    await openAlert(
      this.tx,
      { kind: "events_quarantined", scope: details.deviceId, detail: details },
      { now: this.now },
    );
  }

  async openInvariantAlert(details: AlertDetails["event_invariant_violated"]): Promise<void> {
    await openAlert(
      this.tx,
      { kind: "event_invariant_violated", scope: details.eventId, detail: details },
      { now: this.now },
    );
  }

  private async originOf(event: UnappliedEvent): Promise<AppliedOrigin> {
    const [row] = await this.tx
      .select({ locationId: registers.locationId, registerId: registers.id })
      .from(registerInstallations)
      .innerJoin(registers, eq(registers.id, registerInstallations.registerId))
      .where(eq(registerInstallations.id, event.deviceId));
    if (!row) {
      throw new Error(`installation ${event.deviceId} is not a known register`);
    }
    return { ...row, deviceId: event.deviceId };
  }
}

export class DrizzleEventApplication<TQueryResult extends PgQueryResultHKT>
  implements EventApplication
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly now: () => Date;

  constructor(db: PgDatabase<TQueryResult>, now: () => Date) {
    this.db = db;
    this.now = now;
  }

  async pendingAggregates(): Promise<AggregateKey[]> {
    const firstReceivedAt = min(inbox.receivedAt);
    return this.db
      .select({ aggregateType: inbox.aggregateType, aggregateId: inbox.aggregateId })
      .from(inbox)
      .where(and(isNull(inbox.appliedAt), isNull(inbox.quarantinedAt)))
      .groupBy(inbox.aggregateType, inbox.aggregateId)
      .orderBy(asc(firstReceivedAt), asc(inbox.aggregateType), asc(inbox.aggregateId));
  }

  transaction<T>(work: (tx: EventApplicationTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(new DrizzleEventApplicationTransaction(tx, this.now)));
  }
}
