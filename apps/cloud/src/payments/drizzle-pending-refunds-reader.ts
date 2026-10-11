import { REFUND_ORIGINS, REFUND_PENDING_STATE, type RefundOrigin } from "@purosur/domain";
import type { PendingRefundRecord, PendingRefundsReader } from "@purosur/domain/payments/use-cases";
import { and, asc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
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
    return rows.map(({ origin, ...row }) => {
      if (!isRefundOrigin(origin)) {
        throw new Error(`refund ${row.id} has an origin outside the catalog: ${origin}`);
      }
      return { ...row, origin };
    });
  }
}
