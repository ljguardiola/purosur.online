import {
  ARGENTINA_TIME_ZONE,
  SALES_REPORT_SALE_STATE,
  type SoldLinesOfGroup,
  WEIGHT_SOURCES,
  type WeightSource,
} from "@purosur/domain";
import type { ProductSalesReportReader, SoldLinesQuery } from "@purosur/domain/sales/use-cases";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { products, saleLines, sales } from "../platform/db/schema.js";

const saleDay = sql<string>`to_char(${sales.completedAt} at time zone ${ARGENTINA_TIME_ZONE}, 'YYYY-MM-DD')`;

const categoryPaths = sql`(
  with recursive walk(id, path) as (
    select id, array[name] from categories where parent_id is null
    union all
    select child.id, walk.path || child.name from categories child join walk on child.parent_id = walk.id
  )
  select id, path from walk
) as category_paths`;

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

export class DrizzleProductSalesReportReader<TQueryResult extends PgQueryResultHKT>
  implements ProductSalesReportReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async completedSalesByProduct(query: SoldLinesQuery): Promise<SoldLinesOfGroup[]> {
    const rows = await this.db
      .select({
        id: saleLines.productId,
        name: sql<string>`coalesce(${products.name}, max(${saleLines.productName}))`,
        weightSource: saleLines.weightSource,
        quantity: sql<number>`sum(${saleLines.quantity})`.mapWith(Number),
        amount: sql<number>`sum(${saleLines.lineTotal})`.mapWith(Number),
      })
      .from(saleLines)
      .innerJoin(sales, eq(sales.id, saleLines.saleId))
      .leftJoin(products, eq(products.id, saleLines.productId))
      .where(this.completedSalesOf(query))
      .groupBy(saleLines.productId, products.name, saleLines.weightSource);
    return rows.map(({ id, name, weightSource, quantity, amount }) => ({
      id,
      path: [name],
      weightSource: weightSourceOf(weightSource),
      quantity,
      amount,
    }));
  }

  async completedSalesByCategory(query: SoldLinesQuery): Promise<SoldLinesOfGroup[]> {
    const path = sql<string[] | null>`category_paths.path`;
    const rows = await this.db
      .select({
        id: products.categoryId,
        path,
        weightSource: saleLines.weightSource,
        quantity: sql<number>`sum(${saleLines.quantity})`.mapWith(Number),
        amount: sql<number>`sum(${saleLines.lineTotal})`.mapWith(Number),
      })
      .from(saleLines)
      .innerJoin(sales, eq(sales.id, saleLines.saleId))
      .leftJoin(products, eq(products.id, saleLines.productId))
      .leftJoin(categoryPaths, sql`category_paths.id = ${products.categoryId}`)
      .where(this.completedSalesOf(query))
      .groupBy(products.categoryId, path, saleLines.weightSource);
    return rows.map(({ id, path: names, weightSource, quantity, amount }) => ({
      id,
      path: names ?? [],
      weightSource: weightSourceOf(weightSource),
      quantity,
      amount,
    }));
  }

  private completedSalesOf({ locationId, range, registerId }: SoldLinesQuery) {
    return and(
      eq(sales.locationId, locationId),
      eq(sales.state, SALES_REPORT_SALE_STATE),
      registerId === undefined ? undefined : eq(sales.registerId, registerId),
      sql`${saleDay} >= ${range.from}`,
      sql`${saleDay} <= ${range.to}`,
    );
  }
}
