import {
  type AlertKind,
  REFUND_DISCARDED_STATE,
  REFUND_DONE_STATE,
  REFUND_PENDING_STATE,
} from "@purosur/domain";
import { closeAlert } from "@purosur/domain/alerts/use-cases";
import type {
  LockedRefund,
  RefundStore,
  RefundStoreTransaction,
} from "@purosur/domain/payments/use-cases";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { DrizzleAlertStore } from "../alerts/drizzle-alert-store.js";
import { openAlertCondition } from "../alerts/open-alert-condition.js";
import {
  alerts,
  auditLog,
  paymentRefunds,
  paymentTransactions,
  registers,
  salePayments,
  sales,
} from "../platform/db/schema.js";
import { hashSourceAddress } from "../sessions/sign-in-lockout.js";
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";

const REFUND_COMPLETION_VERSION = 1;

export type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

export class DrizzleRefundStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements RefundStoreTransaction
{
  protected readonly tx: Transaction<TQueryResult>;
  protected readonly pending: PendingChanges;
  protected readonly branchOfLockedRefund = new Map<string, string>();

  constructor(tx: Transaction<TQueryResult>, pending: PendingChanges) {
    this.tx = tx;
    this.pending = pending;
  }

  async lockRefund(refundId: string, locationId: string): Promise<LockedRefund | undefined> {
    const [row] = await this.tx
      .select({
        id: paymentRefunds.id,
        state: paymentRefunds.state,
        origin: paymentRefunds.origin,
        method: paymentRefunds.method,
        confirmedAt: paymentRefunds.confirmedAt,
        lastRefusalReason: paymentRefunds.lastRefusalReason,
      })
      .from(paymentRefunds)
      .leftJoin(salePayments, eq(salePayments.id, paymentRefunds.paymentId))
      .leftJoin(sales, eq(sales.id, salePayments.saleId))
      .leftJoin(
        paymentTransactions,
        eq(paymentTransactions.id, paymentRefunds.paymentTransactionId),
      )
      .innerJoin(
        registers,
        eq(registers.id, sql`coalesce(${sales.registerId}, ${paymentTransactions.registerId})`),
      )
      .where(
        and(
          eq(paymentRefunds.id, refundId),
          eq(sql`coalesce(${sales.locationId}, ${registers.locationId})`, locationId),
        ),
      )
      .for("update", { of: paymentRefunds });
    if (row) {
      this.branchOfLockedRefund.set(row.id, locationId);
    }
    return row;
  }

  async recordRefundDone(refundId: string, doneBy: string, doneAt: Date): Promise<void> {
    const locationId = this.branchOfLockedRefund.get(refundId);
    if (locationId === undefined) {
      throw new Error("a refund is marked done only after it is locked");
    }
    await this.tx
      .update(paymentRefunds)
      .set({ state: REFUND_DONE_STATE, doneBy, doneAt })
      .where(eq(paymentRefunds.id, refundId));
    await this.tx.insert(auditLog).values({
      entity: "payment_refund",
      entityId: refundId,
      actorId: doneBy,
      previousValue: { state: REFUND_PENDING_STATE },
      newValue: { state: REFUND_DONE_STATE, doneAt: doneAt.toISOString() },
      at: doneAt,
    });
    this.pending.note({
      entity: "refund_completion",
      entityId: refundId,
      version: REFUND_COMPLETION_VERSION,
      op: "insert",
      locationId,
    });
  }

  async recordRefundDiscarded(
    refundId: string,
    discardedBy: string,
    discardedAt: Date,
  ): Promise<void> {
    const [discarded] = await this.tx
      .update(paymentRefunds)
      .set({ state: REFUND_DISCARDED_STATE, discardedBy, discardedAt })
      .where(eq(paymentRefunds.id, refundId))
      .returning({ lastRefusalReason: paymentRefunds.lastRefusalReason });
    const lastRefusalReason = discarded?.lastRefusalReason ?? null;
    await this.tx.insert(auditLog).values({
      entity: "payment_refund",
      entityId: refundId,
      actorId: discardedBy,
      previousValue:
        lastRefusalReason === null
          ? { state: REFUND_PENDING_STATE }
          : { state: REFUND_PENDING_STATE, lastRefusalReason },
      newValue: { state: REFUND_DISCARDED_STATE, discardedAt: discardedAt.toISOString() },
      at: discardedAt,
    });
  }

  async resolveRefundAlert(
    refundId: string,
    kind: AlertKind,
    resolvedBy: string,
    resolvedAt: Date,
  ): Promise<void> {
    const [alert] = await this.tx
      .select({ id: alerts.id })
      .from(alerts)
      .where(and(eq(alerts.kind, kind), eq(alerts.scope, refundId), openAlertCondition()));
    if (alert) {
      await closeAlert(
        {
          store: new DrizzleAlertStore(this.tx, () => resolvedAt),
          clock: { now: () => resolvedAt },
          hasher: { hash: hashSourceAddress },
        },
        { alertId: alert.id, closedBy: resolvedBy },
      );
    }
  }
}

export class DrizzleRefundStore<TQueryResult extends PgQueryResultHKT> implements RefundStore {
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (tx: RefundStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPendingChanges(this.db, undefined, (tx, pending) =>
      work(new DrizzleRefundStoreTransaction(tx, pending)),
    );
  }
}
