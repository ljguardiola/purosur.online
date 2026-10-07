import { ARGENTINA_TIME_ZONE, type SalesOfDay } from "@purosur/domain";
import type {
  ReportRegister,
  SalesByDayQuery,
  SalesReportReader,
} from "@purosur/domain/sales/use-cases";
import { and, asc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { registers, sales } from "../platform/db/schema.js";

const saleDay = sql<string>`to_char(${sales.completedAt} at time zone ${ARGENTINA_TIME_ZONE}, 'YYYY-MM-DD')`;

export class DrizzleSalesReportReader<TQueryResult extends PgQueryResultHKT>
  implements SalesReportReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async completedSalesByDay({
    locationId,
    range,
    registerId,
  }: SalesByDayQuery): Promise<SalesOfDay[]> {
    return this.db
      .select({
        day: saleDay,
        salesCount: sql<number>`count(*)`.mapWith(Number),
        total: sql<number>`sum(${sales.total})`.mapWith(Number),
      })
      .from(sales)
      .where(
        and(
          eq(sales.locationId, locationId),
          registerId === undefined ? undefined : eq(sales.registerId, registerId),
          sql`${saleDay} >= ${range.from}`,
          sql`${saleDay} <= ${range.to}`,
        ),
      )
      .groupBy(sql`1`)
      .orderBy(sql`1`);
  }

  async registersOfBranch(locationId: string): Promise<ReportRegister[]> {
    return this.db
      .select({ id: registers.id, name: registers.name })
      .from(registers)
      .where(eq(registers.locationId, locationId))
      .orderBy(asc(registers.name));
  }
}
