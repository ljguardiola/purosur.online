import {
  ARGENTINA_TIME_ZONE,
  type CashRoundingRecord,
  SALES_REPORT_SALE_STATE,
} from "@purosur/domain";
import type { CashRoundingQuery, CashRoundingReportReader } from "@purosur/domain/sales/use-cases";
import { and, eq, gt, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { registers, sales } from "../platform/db/schema.js";

const saleDay = sql<string>`to_char(${sales.completedAt} at time zone ${ARGENTINA_TIME_ZONE}, 'YYYY-MM-DD')`;

export class DrizzleCashRoundingReportReader<TQueryResult extends PgQueryResultHKT>
  implements CashRoundingReportReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async completedCashRoundings({
    locationId,
    range,
    registerId,
  }: CashRoundingQuery): Promise<CashRoundingRecord[]> {
    return this.db
      .select({
        day: saleDay,
        registerId: registers.id,
        registerName: registers.name,
        rounded: sql<number>`sum(${sales.cashRounding})`.mapWith(Number),
        roundedSaleCount: sql<number>`count(*)`.mapWith(Number),
      })
      .from(sales)
      .innerJoin(registers, eq(registers.id, sales.registerId))
      .where(
        and(
          eq(sales.locationId, locationId),
          eq(sales.state, SALES_REPORT_SALE_STATE),
          gt(sales.cashRounding, 0),
          registerId === undefined ? undefined : eq(sales.registerId, registerId),
          sql`${saleDay} >= ${range.from}`,
          sql`${saleDay} <= ${range.to}`,
        ),
      )
      .groupBy(sql`1`, sql`2`, sql`3`);
  }
}
