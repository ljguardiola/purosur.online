import {
  ARGENTINA_TIME_ZONE,
  type MarginAllocation,
  type MarginSaleLine,
  SALES_REPORT_SALE_STATE,
} from "@purosur/domain";
import type { MarginQuery, SaleMarginReportReader } from "@purosur/domain/stock/use-cases";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { categoryPaths } from "../catalog/category-paths.js";
import { netContentRow } from "../catalog/net-content-row.js";
import {
  brands,
  lotAllocations,
  lots,
  products,
  returnLines,
  saleLines,
  sales,
  stockMovements,
} from "../platform/db/schema.js";

const saleDay = sql<string>`to_char(${sales.completedAt} at time zone ${ARGENTINA_TIME_ZONE}, 'YYYY-MM-DD')`;

export class DrizzleSaleMarginReportReader<TQueryResult extends PgQueryResultHKT>
  implements SaleMarginReportReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async completedSaleLinesByProduct(query: MarginQuery): Promise<MarginSaleLine[]> {
    const refunds = this.refundsOfSaleLines();
    const rows = await this.db
      .select({
        saleLineId: saleLines.id,
        saleId: saleLines.saleId,
        id: saleLines.productId,
        name: sql<string>`coalesce(${products.name}, ${saleLines.productName})`,
        brandName: brands.name,
        netContentQuantity: products.netContentQuantity,
        netContentUnit: products.netContentUnit,
        amount: sql<number>`${saleLines.lineTotal} - coalesce(${refunds.refunded}, 0)`.mapWith(
          Number,
        ),
      })
      .from(saleLines)
      .innerJoin(sales, eq(sales.id, saleLines.saleId))
      .leftJoin(products, eq(products.id, saleLines.productId))
      .leftJoin(brands, eq(brands.id, products.brandId))
      .leftJoin(refunds, eq(refunds.saleLineId, saleLines.id))
      .where(this.completedSalesOf(query));
    const allocations = await this.allocationsOfSaleLines(query);
    return rows.map(({ saleLineId, name, amount, ...line }) => ({
      saleId: line.saleId,
      id: line.id,
      path: [name],
      brandName: line.brandName,
      netContent: netContentRow(line),
      amount,
      allocations: allocations.get(saleLineId) ?? [],
    }));
  }

  async completedSaleLinesByCategory(query: MarginQuery): Promise<MarginSaleLine[]> {
    const refunds = this.refundsOfSaleLines();
    const path = sql<string[] | null>`category_paths.path`;
    const rows = await this.db
      .select({
        saleLineId: saleLines.id,
        saleId: saleLines.saleId,
        id: products.categoryId,
        path,
        amount: sql<number>`${saleLines.lineTotal} - coalesce(${refunds.refunded}, 0)`.mapWith(
          Number,
        ),
      })
      .from(saleLines)
      .innerJoin(sales, eq(sales.id, saleLines.saleId))
      .leftJoin(products, eq(products.id, saleLines.productId))
      .leftJoin(categoryPaths, sql`category_paths.id = ${products.categoryId}`)
      .leftJoin(refunds, eq(refunds.saleLineId, saleLines.id))
      .where(this.completedSalesOf(query));
    const allocations = await this.allocationsOfSaleLines(query);
    return rows.map(({ saleLineId, saleId, id, path: names, amount }) => ({
      saleId,
      id,
      path: names ?? [],
      brandName: null,
      netContent: null,
      amount,
      allocations: allocations.get(saleLineId) ?? [],
    }));
  }

  private refundsOfSaleLines() {
    return this.db
      .select({
        saleLineId: returnLines.saleLineId,
        refunded: sql<number>`sum(${returnLines.refundedAmount})`.mapWith(Number).as("refunded"),
      })
      .from(returnLines)
      .groupBy(returnLines.saleLineId)
      .as("refunds");
  }

  private async allocationsOfSaleLines(
    query: MarginQuery,
  ): Promise<Map<string, MarginAllocation[]>> {
    const rows = await this.db
      .select({
        saleLineId: stockMovements.saleLineId,
        lotId: lotAllocations.lotId,
        movementKind: stockMovements.kind,
        quantity: sql<number>`sum(${lotAllocations.quantity})`.mapWith(Number),
        technical: lots.technical,
        costIncomplete: lots.costIncomplete,
        costTotalCents: lots.costTotalCents,
        costQuantity: lots.costQuantity,
      })
      .from(lotAllocations)
      .innerJoin(stockMovements, eq(stockMovements.id, lotAllocations.movementId))
      .innerJoin(lots, eq(lots.id, lotAllocations.lotId))
      .innerJoin(saleLines, eq(saleLines.id, stockMovements.saleLineId))
      .innerJoin(sales, eq(sales.id, saleLines.saleId))
      .where(and(this.completedSalesOf(query), inArray(stockMovements.kind, ["sale", "return"])))
      .groupBy(
        stockMovements.saleLineId,
        lotAllocations.lotId,
        stockMovements.kind,
        lots.technical,
        lots.costIncomplete,
        lots.costTotalCents,
        lots.costQuantity,
      );
    const bySaleLine = new Map<string, MarginAllocation[]>();
    for (const row of rows) {
      if (
        row.saleLineId === null ||
        (row.movementKind !== "sale" && row.movementKind !== "return")
      ) {
        continue;
      }
      const allocations = bySaleLine.get(row.saleLineId) ?? [];
      allocations.push({
        lotId: row.lotId,
        movementKind: row.movementKind,
        quantity: row.quantity,
        technical: row.technical,
        costIncomplete: row.costIncomplete,
        cost:
          row.costTotalCents === null || row.costQuantity === null
            ? null
            : { totalCents: row.costTotalCents, quantity: row.costQuantity },
      });
      bySaleLine.set(row.saleLineId, allocations);
    }
    return bySaleLine;
  }

  private completedSalesOf({ locationId, range, registerId }: MarginQuery) {
    return and(
      eq(sales.locationId, locationId),
      eq(sales.state, SALES_REPORT_SALE_STATE),
      registerId === undefined ? undefined : eq(sales.registerId, registerId),
      sql`${saleDay} >= ${range.from}`,
      sql`${saleDay} <= ${range.to}`,
    );
  }
}
