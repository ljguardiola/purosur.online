import { reportsFailedQuery } from "@purosur/contracts";
import type { EventInvariantBreaks, EventQuarantine } from "@purosur/domain";
import {
  applyOpeningCount,
  applyRegisterStockMovements,
  withdrawOpeningCount,
} from "@purosur/domain/stock/use-cases";
import type {
  AggregateKey,
  EventApplication,
  EventApplicationTransaction,
  FailedAttempt,
  ProviderTransactionOfPayment,
  StockApplication,
  SyncedFact,
  UnappliedEvent,
} from "@purosur/domain/sync/use-cases";
import { and, asc, eq, isNull, min, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { openEventInvariantAlert } from "../alerts/event-invariant-alert.js";
import { openQuarantinedEventAlert } from "../alerts/quarantined-event-alert.js";
import { recordAppliedQrPaymentReplacement } from "../payments/drizzle-applied-qr-payment-replacement.js";
import { providerTransactionOfPayment } from "../payments/drizzle-provider-transactions.js";
import { describeDatabaseFailure, errorCode } from "../platform/db/describe-database-failure.js";
import { inbox, registerInstallations, registers } from "../platform/db/schema.js";
import {
  type AppliedOrigin,
  closeAppliedCashSession,
  openAppliedCashSession,
  recordAppliedCashMovement,
} from "../register/drizzle-applied-cash-sessions.js";
import {
  recordAppliedPrintState,
  recordAppliedReprint,
} from "../sales/drizzle-applied-sale-receipts.js";
import { recordAppliedCancelledSale, recordAppliedSale } from "../sales/drizzle-applied-sales.js";
import { DrizzleStockStoreTransaction } from "../stock/drizzle-stock-store.js";
import { type PendingChanges, withPendingChanges } from "./change-log.js";
import { lockDeviceQuarantines } from "./lock-device-quarantines.js";

type OpeningCountRecordedFact = Extract<SyncedFact, { kind: "opening_count_recorded" }>["count"];
type OpeningCountWithdrawnFact = Extract<
  SyncedFact,
  { kind: "opening_count_withdrawn" }
>["withdrawal"];
type CompletedSale = Extract<SyncedFact, { kind: "sale_completed" }>["sale"];

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

class DrizzleEventApplicationTransaction<TQueryResult extends PgQueryResultHKT>
  implements EventApplicationTransaction
{
  private readonly tx: Transaction<TQueryResult>;
  private readonly now: () => Date;
  private readonly pending: PendingChanges;

  constructor(tx: Transaction<TQueryResult>, now: () => Date, pending: PendingChanges) {
    this.tx = tx;
    this.now = now;
    this.pending = pending;
  }

  async lockAggregate({ aggregateType, aggregateId }: AggregateKey): Promise<boolean> {
    const [row] = await this.tx
      .select({
        held: sql<boolean>`pg_try_advisory_xact_lock(hashtextextended(json_build_array(${aggregateType}::text, ${aggregateId}::text)::text, 0))`,
      })
      .from(sql`(values (1)) as attempt(one)`);
    return row?.held === true;
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

  async providerTransactionOfPayment(
    paymentId: string,
  ): Promise<ProviderTransactionOfPayment | null> {
    return providerTransactionOfPayment(this.tx, paymentId);
  }

  async record(fact: SyncedFact, event: UnappliedEvent): Promise<void> {
    switch (fact.kind) {
      case "cash_session_opened":
        return openAppliedCashSession(this.tx, await this.originOf(event), this.pending, fact);
      case "cash_session_closed":
        return closeAppliedCashSession(this.tx, fact);
      case "cash_movement_recorded":
        return recordAppliedCashMovement(this.tx, event.eventId, fact);
      case "sale_completed":
        return recordAppliedSale(this.tx, await this.originOf(event), fact, this.now());
      case "sale_cancelled":
        return recordAppliedCancelledSale(
          this.tx,
          await this.originOf(event),
          fact,
          event.eventId,
          this.now(),
        );
      case "sale_print_state_changed":
        return recordAppliedPrintState(this.tx, await this.originOf(event), fact);
      case "reprint_recorded":
        return recordAppliedReprint(this.tx, await this.originOf(event), fact);
      case "qr_payment_replaced":
        return recordAppliedQrPaymentReplacement(
          this.tx,
          await this.originOf(event),
          fact,
          this.now(),
        );
      case "opening_count_recorded":
      case "opening_count_withdrawn":
      case "fiscal_gate_failed":
        return;
    }
  }

  async applyOpeningCount(
    count: OpeningCountRecordedFact,
    event: UnappliedEvent,
  ): Promise<StockApplication> {
    const { locationId } = await this.originOf(event);
    const outcome = await applyOpeningCount(
      new DrizzleStockStoreTransaction(this.tx, this.pending),
      {
        locationId,
        occurredAt: count.countedAt,
        actorId: count.actorId,
        movementId: count.movementId,
        productId: count.productId,
        counted: count.counted,
        expiresOn: count.expiresOn,
      },
    );
    switch (outcome.kind) {
      case "recorded":
      case "already_applied":
        return { kind: "applied" };
      case "not_found":
        return { kind: "refused", reason: `product ${count.productId} is not in the catalog` };
      case "invalid_quantity":
        return {
          kind: "refused",
          reason: `an opening count of product ${count.productId} has a quantity it can't be counted in`,
        };
    }
  }

  async withdrawOpeningCount(
    withdrawal: OpeningCountWithdrawnFact,
    event: UnappliedEvent,
  ): Promise<StockApplication> {
    const { locationId } = await this.originOf(event);
    const outcome = await withdrawOpeningCount(
      new DrizzleStockStoreTransaction(this.tx, this.pending),
      {
        locationId,
        occurredAt: withdrawal.withdrawnAt,
        actorId: withdrawal.actorId,
        movementId: withdrawal.movementId,
        withdrawnMovementId: withdrawal.withdrawnMovementId,
      },
    );
    return outcome.kind === "not_found"
      ? {
          kind: "refused",
          reason: `opening count movement ${withdrawal.withdrawnMovementId} was never counted`,
        }
      : { kind: "applied" };
  }

  async applySaleStock(
    sale: CompletedSale,
    movements: NonNullable<CompletedSale["stockMovements"]>,
    event: UnappliedEvent,
  ): Promise<StockApplication> {
    const { locationId } = await this.originOf(event);
    const outcome = await applyRegisterStockMovements(
      new DrizzleStockStoreTransaction(this.tx, this.pending),
      {
        locationId,
        occurredAt: sale.completedAt,
        actorId: sale.actorId,
        movements: movements.map((movement) => ({ ...movement, kind: "sale" })),
      },
    );
    switch (outcome.kind) {
      case "applied":
        return { kind: "applied" };
      case "not_found":
        return { kind: "refused", reason: `product ${outcome.productId} is not in the catalog` };
      case "invalid_quantity":
        return {
          kind: "refused",
          reason: `a sale moved a quantity of product ${outcome.productId} it can't be sold in`,
        };
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

  async lockDeviceQuarantines(deviceId: string): Promise<void> {
    await lockDeviceQuarantines(this.tx, deviceId);
  }

  async recordQuarantine(quarantine: EventQuarantine): Promise<void> {
    await this.tx
      .update(inbox)
      .set({ quarantineReason: quarantine.reason })
      .where(eq(inbox.eventId, quarantine.eventId));
    await openQuarantinedEventAlert(this.tx, quarantine, this.now());
  }

  async recordInvariantBreaks(found: EventInvariantBreaks): Promise<void> {
    await openEventInvariantAlert(this.tx, found, this.now());
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

  reasonOf(error: unknown): string {
    if (!(error instanceof Error)) {
      return String(error);
    }
    return reportsFailedQuery(error.message) || errorCode(error) !== undefined
      ? describeDatabaseFailure(error)
      : error.message;
  }

  transaction<T>(work: (tx: EventApplicationTransaction) => Promise<T>): Promise<T> {
    return withPendingChanges(this.db, undefined, (tx, pending) =>
      work(new DrizzleEventApplicationTransaction(tx, this.now, pending)),
    );
  }
}
