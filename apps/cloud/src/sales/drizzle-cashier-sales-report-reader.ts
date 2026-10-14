import { ARGENTINA_TIME_ZONE, SALES_REPORT_SALE_STATE, type SoldByCashier } from "@purosur/domain";
import type { CashierSalesQuery, CashierSalesReportReader } from "@purosur/domain/sales/use-cases";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { sales, users } from "../platform/db/schema.js";

const saleDay = sql<string>`to_char(${sales.completedAt} at time zone ${ARGENTINA_TIME_ZONE}, 'YYYY-MM-DD')`;

export class DrizzleCashierSalesReportReader<TQueryResult extends PgQueryResultHKT>
  implements CashierSalesReportReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async completedSalesByCashier({
    locationId,
    range,
    registerId,
  }: CashierSalesQuery): Promise<SoldByCashier[]> {
    return this.db
      .select({
        cashierId: sales.actorId,
        name: users.firstName,
        sessions: sql<number>`count(distinct ${sales.sessionId})`.mapWith(Number),
        salesCount: sql<number>`count(*)`.mapWith(Number),
        total: sql<number>`sum(${sales.total})`.mapWith(Number),
      })
      .from(sales)
      .leftJoin(users, sql`${users.id}::text = ${sales.actorId}`)
      .where(
        and(
          eq(sales.locationId, locationId),
          eq(sales.state, SALES_REPORT_SALE_STATE),
          registerId === undefined ? undefined : eq(sales.registerId, registerId),
          sql`${saleDay} >= ${range.from}`,
          sql`${saleDay} <= ${range.to}`,
        ),
      )
      .groupBy(sales.actorId, users.firstName);
  }
}
