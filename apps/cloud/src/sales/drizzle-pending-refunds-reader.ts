import { REFUND_PENDING_STATE } from "@purosur/domain";
import type { PendingRefund, PendingRefundsReader } from "@purosur/domain/sales/use-cases";
import { and, asc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { paymentRefunds, registers, salePayments, sales, users } from "../platform/db/schema.js";

export class DrizzlePendingRefundsReader<TQueryResult extends PgQueryResultHKT>
  implements PendingRefundsReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async pendingRefunds(locationId: string): Promise<PendingRefund[]> {
    const rows = await this.db
      .select({
        id: paymentRefunds.id,
        saleId: sales.id,
        registerId: sales.registerId,
        registerName: registers.name,
        method: paymentRefunds.method,
        amount: paymentRefunds.amount,
        occurredAt: paymentRefunds.occurredAt,
        cancelledBy: sales.actorId,
        cancelledByName: users.firstName,
      })
      .from(paymentRefunds)
      .innerJoin(salePayments, eq(salePayments.id, paymentRefunds.paymentId))
      .innerJoin(sales, eq(sales.id, salePayments.saleId))
      .innerJoin(registers, eq(registers.id, sales.registerId))
      .leftJoin(users, sql`${users.id}::text = ${sales.actorId}`)
      .where(and(eq(sales.locationId, locationId), eq(paymentRefunds.state, REFUND_PENDING_STATE)))
      .orderBy(asc(paymentRefunds.occurredAt), asc(paymentRefunds.id));
    return rows;
  }
}
