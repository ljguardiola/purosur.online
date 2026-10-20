import {
  ARGENTINA_TIME_ZONE,
  type LineDiscountRecord,
  type ManualAdjustmentValue,
  type ManualDiscountRecords,
  SALES_REPORT_SALE_STATE,
  type SaleDiscountRecord,
  type SaleDiscountValue,
  WEIGHT_SOURCES,
  type WeightSource,
} from "@purosur/domain";
import type {
  ManualDiscountsQuery,
  ManualDiscountsReportReader,
} from "@purosur/domain/sales/use-cases";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { alias } from "drizzle-orm/pg-core";
import { saleLines, sales, users } from "../platform/db/schema.js";

const saleDay = sql<string>`to_char(${sales.completedAt} at time zone ${ARGENTINA_TIME_ZONE}, 'YYYY-MM-DD')`;

function stored<T>(value: T | null, what: string): T {
  if (value === null) {
    throw new Error(`A stored sale discount has no ${what}`);
  }
  return value;
}

function adjustmentOf(kind: string | null, value: number | null): ManualAdjustmentValue {
  const amount = stored(value, "value");
  switch (kind) {
    case "PRICE":
      return { kind, unitPrice: amount };
    case "PERCENT":
      return { kind, percent: amount };
    case "AMOUNT":
      return { kind, amount };
    default:
      throw new Error(`A stored sale discount has an unknown kind: ${kind}`);
  }
}

function saleDiscountOf(kind: string | null, value: number | null): SaleDiscountValue {
  const adjustment = adjustmentOf(kind, value);
  if (adjustment.kind === "PRICE") {
    throw new Error("A stored sale discount on the total is a new price");
  }
  return adjustment;
}

function weightSourceOf(stored: string | null): WeightSource | null {
  if (stored === null) {
    return null;
  }
  const weightSource = WEIGHT_SOURCES.find((known) => known === stored);
  if (weightSource === undefined) {
    throw new Error(`A stored sale line has an unknown weight source: ${stored}`);
  }
  return weightSource;
}

export class DrizzleManualDiscountsReportReader<TQueryResult extends PgQueryResultHKT>
  implements ManualDiscountsReportReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async completedManualDiscounts(query: ManualDiscountsQuery): Promise<ManualDiscountRecords> {
    return {
      saleDiscounts: await this.saleDiscounts(query),
      lineDiscounts: await this.lineDiscounts(query),
    };
  }

  private async saleDiscounts({
    locationId,
    range,
    registerId,
  }: ManualDiscountsQuery): Promise<SaleDiscountRecord[]> {
    const authorizer = alias(users, "authorizer");
    const rows = await this.db
      .select({
        saleId: sales.id,
        operationNumber: sales.operationNumber,
        completedAt: sales.completedAt,
        actorId: sales.actorId,
        actorName: users.firstName,
        authorizedBy: sales.saleDiscountAuthorizedBy,
        authorizedByName: authorizer.firstName,
        reason: sales.saleDiscountReason,
        kind: sales.saleDiscountKind,
        value: sales.saleDiscountValue,
        amount: sales.saleDiscountAmount,
      })
      .from(sales)
      .leftJoin(users, sql`${users.id}::text = ${sales.actorId}`)
      .leftJoin(authorizer, sql`${authorizer.id}::text = ${sales.saleDiscountAuthorizedBy}`)
      .where(
        and(
          isNotNull(sales.saleDiscountKind),
          eq(sales.locationId, locationId),
          eq(sales.state, SALES_REPORT_SALE_STATE),
          registerId === undefined ? undefined : eq(sales.registerId, registerId),
          sql`${saleDay} >= ${range.from}`,
          sql`${saleDay} <= ${range.to}`,
        ),
      );
    return rows.map((row) => ({
      saleId: row.saleId,
      operationNumber: row.operationNumber,
      completedAt: stored(row.completedAt, "completion time"),
      actorId: row.actorId,
      actorName: row.actorName,
      authorizedBy: row.authorizedBy,
      authorizedByName: row.authorizedByName,
      reason: stored(row.reason, "reason"),
      discount: saleDiscountOf(row.kind, row.value),
      amount: stored(row.amount, "amount"),
    }));
  }

  private async lineDiscounts({
    locationId,
    range,
    registerId,
  }: ManualDiscountsQuery): Promise<LineDiscountRecord[]> {
    const authorizer = alias(users, "authorizer");
    const rows = await this.db
      .select({
        saleId: sales.id,
        operationNumber: sales.operationNumber,
        completedAt: sales.completedAt,
        actorId: sales.actorId,
        actorName: users.firstName,
        authorizedBy: saleLines.manualAdjustmentAuthorizedBy,
        authorizedByName: authorizer.firstName,
        reason: saleLines.manualAdjustmentReason,
        lineId: saleLines.id,
        productName: saleLines.productName,
        quantity: saleLines.quantity,
        weightSource: saleLines.weightSource,
        listUnitPrice: saleLines.listUnitPrice,
        kind: saleLines.manualAdjustmentKind,
        value: saleLines.manualAdjustmentValue,
      })
      .from(saleLines)
      .innerJoin(sales, eq(sales.id, saleLines.saleId))
      .leftJoin(users, sql`${users.id}::text = ${sales.actorId}`)
      .leftJoin(authorizer, sql`${authorizer.id}::text = ${saleLines.manualAdjustmentAuthorizedBy}`)
      .where(
        and(
          isNotNull(saleLines.manualAdjustmentKind),
          eq(sales.locationId, locationId),
          eq(sales.state, SALES_REPORT_SALE_STATE),
          registerId === undefined ? undefined : eq(sales.registerId, registerId),
          sql`${saleDay} >= ${range.from}`,
          sql`${saleDay} <= ${range.to}`,
        ),
      );
    return rows.map((row) => ({
      saleId: row.saleId,
      operationNumber: row.operationNumber,
      completedAt: stored(row.completedAt, "completion time"),
      actorId: row.actorId,
      actorName: row.actorName,
      authorizedBy: row.authorizedBy,
      authorizedByName: row.authorizedByName,
      reason: stored(row.reason, "reason"),
      lineId: row.lineId,
      productName: row.productName,
      quantity: row.quantity,
      weightSource: weightSourceOf(row.weightSource),
      listUnitPrice: row.listUnitPrice,
      adjustment: adjustmentOf(row.kind, row.value),
    }));
  }
}
