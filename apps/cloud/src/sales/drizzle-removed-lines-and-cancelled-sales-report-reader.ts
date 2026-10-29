import {
  ARGENTINA_TIME_ZONE,
  CANCELLED_SALES_REPORT_SALE_STATE,
  type CancelledSaleFacts,
  type RemovalFacts,
  type RemovedLinesGroup,
} from "@purosur/domain";
import type {
  RemovedLinesAndCancelledSalesQuery,
  RemovedLinesAndCancelledSalesReportReader,
} from "@purosur/domain/sales/use-cases";
import { and, eq, type SQLWrapper, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  cashSessions,
  registers,
  removedSaleLines,
  saleLines,
  salePayments,
  sales,
  users,
} from "../platform/db/schema.js";
import { storedWeightSource } from "../platform/db/stored-weight-source.js";

const dayOf = (moment: SQLWrapper) =>
  sql<string>`to_char(${moment} at time zone ${ARGENTINA_TIME_ZONE}, 'YYYY-MM-DD')`;

export class DrizzleRemovedLinesAndCancelledSalesReportReader<TQueryResult extends PgQueryResultHKT>
  implements RemovedLinesAndCancelledSalesReportReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async removalFacts(query: RemovedLinesAndCancelledSalesQuery): Promise<RemovalFacts> {
    return {
      removedLines: await this.removedLines(query),
      cancelledSales: await this.cancelledSales(query),
    };
  }

  private async removedLines({
    locationId,
    range,
    registerId,
  }: RemovedLinesAndCancelledSalesQuery): Promise<RemovedLinesGroup[]> {
    const removalDay = dayOf(removedSaleLines.removedAt);
    const rows = await this.db
      .select({
        sessionId: removedSaleLines.sessionId,
        registerName: registers.name,
        openedAt: cashSessions.openedAt,
        cashierId: removedSaleLines.actorId,
        cashierName: users.firstName,
        weightSource: removedSaleLines.weightSource,
        lines: sql<number>`count(*)`.mapWith(Number),
        quantity: sql<number>`sum(${removedSaleLines.quantity})`.mapWith(Number),
        amount: sql<number>`sum(${removedSaleLines.lineTotal})`.mapWith(Number),
      })
      .from(removedSaleLines)
      .innerJoin(cashSessions, eq(cashSessions.id, removedSaleLines.sessionId))
      .innerJoin(registers, eq(registers.id, removedSaleLines.registerId))
      .leftJoin(users, sql`${users.id}::text = ${removedSaleLines.actorId}`)
      .where(
        and(
          eq(removedSaleLines.locationId, locationId),
          registerId === undefined ? undefined : eq(removedSaleLines.registerId, registerId),
          sql`${removalDay} >= ${range.from}`,
          sql`${removalDay} <= ${range.to}`,
        ),
      )
      .groupBy(
        removedSaleLines.sessionId,
        registers.name,
        cashSessions.openedAt,
        removedSaleLines.actorId,
        users.firstName,
        removedSaleLines.weightSource,
      );
    return rows.map((row) => ({ ...row, weightSource: storedWeightSource(row.weightSource) }));
  }

  private async cancelledSales({
    locationId,
    range,
    registerId,
  }: RemovedLinesAndCancelledSalesQuery): Promise<CancelledSaleFacts[]> {
    const cancellationDay = dayOf(sales.cancelledAt);
    const inRange = and(
      eq(sales.locationId, locationId),
      eq(sales.state, CANCELLED_SALES_REPORT_SALE_STATE),
      registerId === undefined ? undefined : eq(sales.registerId, registerId),
      sql`${cancellationDay} >= ${range.from}`,
      sql`${cancellationDay} <= ${range.to}`,
    );
    const saleRows = await this.db
      .select({
        saleId: sales.id,
        sessionId: sales.sessionId,
        registerName: registers.name,
        openedAt: cashSessions.openedAt,
        cashierId: sales.actorId,
        cashierName: users.firstName,
        total: sales.total,
        paymentStates: sql<
          string[]
        >`coalesce((select array_agg(${salePayments.state}) from ${salePayments} where ${salePayments.saleId} = ${sales.id}), '{}'::text[])`,
      })
      .from(sales)
      .innerJoin(cashSessions, eq(cashSessions.id, sales.sessionId))
      .innerJoin(registers, eq(registers.id, sales.registerId))
      .leftJoin(users, sql`${users.id}::text = ${sales.actorId}`)
      .where(inRange);
    const lineRows = await this.db
      .select({
        saleId: saleLines.saleId,
        weightSource: saleLines.weightSource,
        quantity: sql<number>`sum(${saleLines.quantity})`.mapWith(Number),
      })
      .from(saleLines)
      .innerJoin(sales, eq(sales.id, saleLines.saleId))
      .where(inRange)
      .groupBy(saleLines.saleId, saleLines.weightSource);
    return saleRows.map((sale) => ({
      ...sale,
      lines: lineRows
        .filter((line) => line.saleId === sale.saleId)
        .map((line) => ({
          weightSource: storedWeightSource(line.weightSource),
          quantity: line.quantity,
        })),
    }));
  }
}
