import { REFUND_DONE_STATE, REFUND_PENDING_STATE } from "@purosur/domain";
import type {
  MercadoPagoRefundRecord,
  MercadoPagoRefundReference,
  MercadoPagoRefundStore,
  MercadoPagoRefundTransaction,
  OriginCancellation,
} from "@purosur/domain/payments/use-cases";
import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  auditLog,
  inbox,
  paymentRefunds,
  paymentTransactions,
  registers,
  salePayments,
  sales,
} from "../platform/db/schema.js";
import { withPendingChanges } from "../sync/change-log.js";
import { DrizzleRefundStoreTransaction } from "./drizzle-refund-store.js";

const SALE_CANCELLED_EVENT = "sale_cancelled";

class DrizzleMercadoPagoRefundTransaction<TQueryResult extends PgQueryResultHKT>
  extends DrizzleRefundStoreTransaction<TQueryResult>
  implements MercadoPagoRefundTransaction
{
  async lockMercadoPagoRefund(
    refundId: string,
    locationId: string,
  ): Promise<MercadoPagoRefundRecord | undefined> {
    if (!(await this.lockRefund(refundId, locationId))) {
      return undefined;
    }
    const [row] = await this.tx
      .select({
        id: paymentRefunds.id,
        saleId: paymentRefunds.saleId,
        paymentId: paymentRefunds.paymentId,
        state: paymentRefunds.state,
        origin: paymentRefunds.origin,
        method: paymentRefunds.method,
        amount: paymentRefunds.amount,
        paymentAmount: salePayments.amount,
        paymentTransactionId: paymentRefunds.paymentTransactionId,
        orderId: paymentTransactions.providerOrderId,
        originEventId: paymentRefunds.originEventId,
        confirmedBy: paymentRefunds.confirmedBy,
        confirmedAt: paymentRefunds.confirmedAt,
        sentAt: paymentRefunds.sentAt,
        providerRefundId: paymentRefunds.providerRefundId,
        attemptKey: paymentRefunds.attemptKey,
        lastRefusalReason: paymentRefunds.lastRefusalReason,
      })
      .from(paymentRefunds)
      .innerJoin(salePayments, eq(salePayments.id, paymentRefunds.paymentId))
      .leftJoin(
        paymentTransactions,
        eq(paymentTransactions.id, paymentRefunds.paymentTransactionId),
      )
      .where(eq(paymentRefunds.id, refundId));
    if (!row) {
      return undefined;
    }
    const { paymentId, ...refund } = row;
    return {
      ...refund,
      locationId,
      refundedOfPayment: await this.refundedOfPayment(refundId, paymentId),
    };
  }

  private async refundedOfPayment(refundId: string, paymentId: string | null): Promise<number> {
    if (paymentId === null) {
      return 0;
    }
    const [others] = await this.tx
      .select({ amount: sql<string>`coalesce(sum(${paymentRefunds.amount}), 0)` })
      .from(paymentRefunds)
      .where(
        and(
          eq(paymentRefunds.paymentId, paymentId),
          ne(paymentRefunds.id, refundId),
          inArray(paymentRefunds.state, [REFUND_PENDING_STATE, REFUND_DONE_STATE]),
        ),
      );
    return Number(others?.amount ?? 0);
  }

  async cancellationOfEvent(originEventId: string): Promise<OriginCancellation | null> {
    const [event] = await this.tx
      .select({ saleId: inbox.aggregateId })
      .from(inbox)
      .where(
        and(
          eq(inbox.eventId, originEventId),
          eq(inbox.eventType, SALE_CANCELLED_EVENT),
          isNotNull(inbox.appliedAt),
        ),
      );
    return event ? { saleId: event.saleId } : null;
  }

  async recordRefundConfirmed(
    refundId: string,
    confirmedBy: string,
    confirmedAt: Date,
    attemptKey: string,
  ): Promise<void> {
    await this.tx
      .update(paymentRefunds)
      .set({ confirmedBy, confirmedAt, attemptKey })
      .where(eq(paymentRefunds.id, refundId));
    await this.audit(
      refundId,
      confirmedBy,
      confirmedAt,
      { confirmed: false },
      {
        confirmed: true,
        confirmedAt: confirmedAt.toISOString(),
      },
    );
  }

  async recordAttemptKey(refundId: string, attemptKey: string | null): Promise<void> {
    await this.tx.update(paymentRefunds).set({ attemptKey }).where(eq(paymentRefunds.id, refundId));
  }

  async recordRefundSent(refundId: string, providerRefundId: string, sentAt: Date): Promise<void> {
    const confirmedBy = await this.confirmerOf(refundId);
    await this.tx
      .update(paymentRefunds)
      .set({ sentAt, providerRefundId, lastRefusalReason: null })
      .where(eq(paymentRefunds.id, refundId));
    await this.audit(
      refundId,
      confirmedBy,
      sentAt,
      { sent: false },
      {
        sent: true,
        sentAt: sentAt.toISOString(),
        providerRefundId,
      },
    );
  }

  async recordRefundRefusal(refundId: string, reason: string, refusedAt: Date): Promise<void> {
    const confirmedBy = await this.confirmerOf(refundId);
    await this.tx
      .update(paymentRefunds)
      .set({ lastRefusalReason: reason })
      .where(eq(paymentRefunds.id, refundId));
    await this.audit(refundId, confirmedBy, refusedAt, null, { lastRefusalReason: reason });
  }

  private async confirmerOf(refundId: string): Promise<string | null> {
    const [row] = await this.tx
      .select({ confirmedBy: paymentRefunds.confirmedBy })
      .from(paymentRefunds)
      .where(eq(paymentRefunds.id, refundId));
    return row?.confirmedBy ?? null;
  }

  private async audit(
    refundId: string,
    actorId: string | null,
    at: Date,
    previousValue: Record<string, unknown> | null,
    newValue: Record<string, unknown>,
  ): Promise<void> {
    await this.tx.insert(auditLog).values({
      entity: "payment_refund",
      entityId: refundId,
      actorId,
      previousValue,
      newValue,
      at,
    });
  }
}

export class DrizzleMercadoPagoRefundStore<TQueryResult extends PgQueryResultHKT>
  implements MercadoPagoRefundStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async refundReference(
    refundId: string,
    locationId: string,
  ): Promise<MercadoPagoRefundReference | undefined> {
    const [row] = await this.referencesWhere(
      and(
        eq(paymentRefunds.id, refundId),
        eq(sql`coalesce(${sales.locationId}, ${registers.locationId})`, locationId),
      ),
    );
    return row;
  }

  confirmedPendingRefunds(): Promise<MercadoPagoRefundReference[]> {
    return this.referencesWhere(
      and(eq(paymentRefunds.state, REFUND_PENDING_STATE), isNotNull(paymentRefunds.confirmedAt)),
    );
  }

  transaction<TOutcome>(
    work: (tx: MercadoPagoRefundTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPendingChanges(this.db, undefined, (tx, pending) =>
      work(new DrizzleMercadoPagoRefundTransaction(tx, pending)),
    );
  }

  private referencesWhere(
    condition: ReturnType<typeof and>,
  ): Promise<MercadoPagoRefundReference[]> {
    return this.db
      .select({
        refundId: paymentRefunds.id,
        locationId: sql<string>`coalesce(${sales.locationId}, ${registers.locationId})`,
        method: paymentRefunds.method,
        origin: paymentRefunds.origin,
        paymentTransactionId: paymentRefunds.paymentTransactionId,
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
      .where(condition)
      .orderBy(paymentRefunds.occurredAt, paymentRefunds.id);
  }
}
