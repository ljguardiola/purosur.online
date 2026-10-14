import {
  methodsCoveringRefundedSale,
  REFUND_ORIGINS,
  REFUND_PENDING_STATE,
  type RefundOrigin,
} from "@purosur/domain";
import type { PendingRefundRecord, PendingRefundsReader } from "@purosur/domain/payments/use-cases";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { alias } from "drizzle-orm/pg-core";
import {
  paymentRefunds,
  paymentTransactions,
  registers,
  salePayments,
  sales,
  users,
} from "../platform/db/schema.js";

function isRefundOrigin(origin: string): origin is RefundOrigin {
  return REFUND_ORIGINS.some((known) => known === origin);
}

export class DrizzlePendingRefundsReader<TQueryResult extends PgQueryResultHKT>
  implements PendingRefundsReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async pendingRefunds(locationId: string): Promise<PendingRefundRecord[]> {
    const confirmers = alias(users, "confirmers");
    const rows = await this.db
      .select({
        id: paymentRefunds.id,
        saleId: paymentRefunds.saleId,
        registerId: registers.id,
        registerName: registers.name,
        method: paymentRefunds.method,
        origin: paymentRefunds.origin,
        providerOrderId: paymentRefunds.providerOrderId,
        amount: paymentRefunds.amount,
        occurredAt: paymentRefunds.occurredAt,
        saleCancelledAt: sales.cancelledAt,
        saleCompletedAt: sales.completedAt,
        transactionCreatedAt: paymentTransactions.createdAt,
        cancelledBy: sales.actorId,
        cancelledByName: users.firstName,
        confirmedAt: paymentRefunds.confirmedAt,
        confirmedByName: confirmers.firstName,
        sentAt: paymentRefunds.sentAt,
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
      .leftJoin(users, sql`${users.id}::text = ${sales.actorId}`)
      .leftJoin(confirmers, sql`${confirmers.id}::text = ${paymentRefunds.confirmedBy}`)
      .where(
        and(
          eq(sql`coalesce(${sales.locationId}, ${registers.locationId})`, locationId),
          eq(paymentRefunds.state, REFUND_PENDING_STATE),
        ),
      )
      .orderBy(asc(paymentRefunds.occurredAt), asc(paymentRefunds.id));
    const payments = await this.paymentsOfSales(rows.map((row) => row.saleId));
    return rows.map(
      ({ origin, saleCancelledAt, saleCompletedAt, transactionCreatedAt, ...row }) => {
        if (!isRefundOrigin(origin)) {
          throw new Error(`refund ${row.id} has an origin outside the catalog: ${origin}`);
        }
        const coveredBy = methodsCoveringRefundedSale(
          origin,
          payments.filter((payment) => payment.saleId === row.saleId),
        );
        const saleOccurredAt = saleCancelledAt ?? saleCompletedAt ?? transactionCreatedAt;
        if (!saleOccurredAt) {
          throw new Error(`refund ${row.id} has no sale or payment transaction to date it by`);
        }
        return { ...row, origin, saleOccurredAt, coveredBy };
      },
    );
  }

  private async paymentsOfSales(saleIds: string[]) {
    if (saleIds.length === 0) {
      return [];
    }
    return this.db
      .select({
        saleId: salePayments.saleId,
        method: salePayments.method,
        state: salePayments.state,
      })
      .from(salePayments)
      .where(inArray(salePayments.saleId, saleIds));
  }
}
