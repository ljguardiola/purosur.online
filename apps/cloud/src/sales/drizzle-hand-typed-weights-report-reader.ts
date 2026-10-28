import {
  ARGENTINA_TIME_ZONE,
  SALES_REPORT_SALE_STATE,
  type WeighedLinesGroup,
} from "@purosur/domain";
import type {
  HandTypedWeightsQuery,
  HandTypedWeightsReportReader,
} from "@purosur/domain/sales/use-cases";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { cashSessions, registers, saleLines, sales, users } from "../platform/db/schema.js";
import { storedWeightSource } from "../platform/db/stored-weight-source.js";

const saleDay = sql<string>`to_char(${sales.completedAt} at time zone ${ARGENTINA_TIME_ZONE}, 'YYYY-MM-DD')`;

export class DrizzleHandTypedWeightsReportReader<TQueryResult extends PgQueryResultHKT>
  implements HandTypedWeightsReportReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async weighedLinesOfCompletedSales({
    locationId,
    range,
    registerId,
  }: HandTypedWeightsQuery): Promise<WeighedLinesGroup[]> {
    const rows = await this.db
      .select({
        sessionId: sales.sessionId,
        registerName: registers.name,
        openedAt: cashSessions.openedAt,
        cashierId: sales.actorId,
        cashierName: users.firstName,
        weightSource: saleLines.weightSource,
        lines: sql<number>`count(*)`.mapWith(Number),
      })
      .from(saleLines)
      .innerJoin(sales, eq(sales.id, saleLines.saleId))
      .innerJoin(cashSessions, eq(cashSessions.id, sales.sessionId))
      .innerJoin(registers, eq(registers.id, sales.registerId))
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
      .groupBy(
        sales.sessionId,
        registers.name,
        cashSessions.openedAt,
        sales.actorId,
        users.firstName,
        saleLines.weightSource,
      );
    return rows.map((row) => ({
      ...row,
      weightSource: storedWeightSource(row.weightSource),
    }));
  }
}
