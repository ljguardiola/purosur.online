import {
  PAYMENT_METHODS,
  type PaymentMethod,
  REFUND_ORIGINS,
  REFUND_PENDING_STATE,
  type RefundOrigin,
} from "@purosur/domain";
import type { PendingRefundRecord, PendingRefundsReader } from "@purosur/domain/payments/use-cases";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  paymentRefunds,
  paymentTransactions,
  registers,
  salePayments,
  sales,
  users,
} from "../platform/db/schema.js";

const LATE_PAYMENT_ORIGIN = "late_payment" satisfies RefundOrigin;

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
    const rows = await this.db
      .select({
        id: paymentRefunds.id,
        saleId: paymentRefunds.saleId,
        registerId: registers.id,
        registerName: registers.name,
        method: paymentRefunds.method,
        origin: paymentRefunds.origin,
        amount: paymentRefunds.amount,
        occurredAt: paymentRefunds.occurredAt,
        saleCancelledAt: sales.cancelledAt,
        saleCompletedAt: sales.completedAt,
        transactionCreatedAt: paymentTransactions.createdAt,
        cancelledBy: sales.actorId,
        cancelledByName: users.firstName,
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
      .where(
        and(
          eq(sql`coalesce(${sales.locationId}, ${registers.locationId})`, locationId),
          eq(paymentRefunds.state, REFUND_PENDING_STATE),
        ),
      )
      .orderBy(asc(paymentRefunds.occurredAt), asc(paymentRefunds.id));
    const coveredBySale = await this.methodsCoveringSales(
      rows.filter((row) => row.origin === LATE_PAYMENT_ORIGIN).map((row) => row.saleId),
    );
    return rows.map(
      ({ origin, saleCancelledAt, saleCompletedAt, transactionCreatedAt, ...row }) => {
        if (!isRefundOrigin(origin)) {
          throw new Error(`refund ${row.id} has an origin outside the catalog: ${origin}`);
        }
        const coveredBy =
          origin === LATE_PAYMENT_ORIGIN ? (coveredBySale.get(row.saleId) ?? []) : [];
        const saleOccurredAt = saleCancelledAt ?? saleCompletedAt ?? transactionCreatedAt;
        if (!saleOccurredAt) {
          throw new Error(`refund ${row.id} has no sale or payment transaction to date it by`);
        }
        return { ...row, origin, saleOccurredAt, coveredBy };
      },
    );
  }

  private async methodsCoveringSales(saleIds: string[]): Promise<Map<string, PaymentMethod[]>> {
    if (saleIds.length === 0) {
      return new Map();
    }
    const payments = await this.db
      .select({ saleId: salePayments.saleId, method: salePayments.method })
      .from(salePayments)
      .where(and(inArray(salePayments.saleId, saleIds), eq(salePayments.state, "APPROVED")));
    return new Map(
      saleIds.map((saleId) => {
        const methods = new Set(
          payments.filter((payment) => payment.saleId === saleId).map((payment) => payment.method),
        );
        return [saleId, PAYMENT_METHODS.filter((method) => methods.has(method))];
      }),
    );
  }
}
