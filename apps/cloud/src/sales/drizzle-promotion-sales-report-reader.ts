import {
  ARGENTINA_TIME_ZONE,
  type DiscountedLinesOfPromotion,
  type DiscountTargetKind,
  type PromotionTerms,
  SALES_REPORT_SALE_STATE,
  WEIGHT_SOURCES,
  type WeightSource,
} from "@purosur/domain";
import type {
  PromotionSalesQuery,
  PromotionSalesReportReader,
} from "@purosur/domain/sales/use-cases";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { categories, discounts, products, saleLines, sales, tags } from "../platform/db/schema.js";
import { storedBenefit } from "../pricing/drizzle-discount-store.js";

const saleDay = sql<string>`to_char(${sales.completedAt} at time zone ${ARGENTINA_TIME_ZONE}, 'YYYY-MM-DD')`;

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

function termsOf(
  discount: typeof discounts.$inferSelect | null,
  targetName: string | null,
): PromotionTerms | null {
  if (discount === null || targetName === null) {
    return null;
  }
  return {
    benefit: storedBenefit(discount),
    target: { kind: targetKindOf(discount), name: targetName },
    weekdays: discount.weekdays,
  };
}

function targetKindOf(discount: typeof discounts.$inferSelect): DiscountTargetKind {
  if (discount.productId !== null) {
    return "PRODUCT";
  }
  if (discount.categoryId !== null) {
    return "CATEGORY";
  }
  return "TAG";
}

export class DrizzlePromotionSalesReportReader<TQueryResult extends PgQueryResultHKT>
  implements PromotionSalesReportReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async completedSalesByPromotion({
    locationId,
    range,
    registerId,
  }: PromotionSalesQuery): Promise<DiscountedLinesOfPromotion[]> {
    const promotionId = sql<string>`${saleLines.promotionId}`;
    const rows = await this.db
      .select({
        promotionId,
        discount: discounts,
        targetName: sql<
          string | null
        >`coalesce(${products.name}, ${categories.name}, ${tags.name})`,
        weightSource: saleLines.weightSource,
        quantity: sql<number>`sum(${saleLines.quantity})`.mapWith(Number),
        lines: sql<number>`count(*)`.mapWith(Number),
        discounted: sql<number>`sum(${saleLines.discountAmount})`.mapWith(Number),
      })
      .from(saleLines)
      .innerJoin(sales, eq(sales.id, saleLines.saleId))
      .leftJoin(discounts, eq(discounts.id, saleLines.promotionId))
      .leftJoin(products, eq(products.id, discounts.productId))
      .leftJoin(categories, eq(categories.id, discounts.categoryId))
      .leftJoin(tags, eq(tags.id, discounts.tagId))
      .where(
        and(
          isNotNull(saleLines.promotionId),
          eq(sales.locationId, locationId),
          eq(sales.state, SALES_REPORT_SALE_STATE),
          registerId === undefined ? undefined : eq(sales.registerId, registerId),
          sql`${saleDay} >= ${range.from}`,
          sql`${saleDay} <= ${range.to}`,
        ),
      )
      .groupBy(
        saleLines.promotionId,
        discounts.id,
        products.id,
        categories.id,
        tags.id,
        saleLines.weightSource,
      );
    return rows.map((row) => ({
      promotionId: row.promotionId,
      name: row.discount?.name ?? null,
      terms: termsOf(row.discount, row.targetName),
      weightSource: weightSourceOf(row.weightSource),
      quantity: row.quantity,
      lines: row.lines,
      discounted: row.discounted,
    }));
  }
}
