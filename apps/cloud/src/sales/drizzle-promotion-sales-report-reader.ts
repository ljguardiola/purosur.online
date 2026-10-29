import {
  ARGENTINA_TIME_ZONE,
  type DiscountedLinesOfPromotion,
  type DiscountTargetKind,
  type PromotionTerms,
  SALES_REPORT_SALE_STATE,
} from "@purosur/domain";
import type {
  PromotionSalesQuery,
  PromotionSalesReportReader,
} from "@purosur/domain/sales/use-cases";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { netContentRow } from "../catalog/net-content-row.js";
import {
  brands,
  categories,
  discounts,
  products,
  saleLines,
  sales,
  tags,
} from "../platform/db/schema.js";
import { storedWeightSource } from "../platform/db/stored-weight-source.js";
import { storedBenefit } from "../pricing/drizzle-discount-store.js";

const saleDay = sql<string>`to_char(${sales.completedAt} at time zone ${ARGENTINA_TIME_ZONE}, 'YYYY-MM-DD')`;

interface ProductIdentity {
  brandName: string | null;
  netContentQuantity: number | null;
  netContentUnit: string | null;
}

function termsOf(
  discount: typeof discounts.$inferSelect | null,
  targetName: string | null,
  product: ProductIdentity,
): PromotionTerms | null {
  if (discount === null || targetName === null) {
    return null;
  }
  return {
    benefit: storedBenefit(discount),
    target: {
      kind: targetKindOf(discount),
      name: targetName,
      brandName: discount.productId === null ? null : product.brandName,
      netContent: discount.productId === null ? null : netContentRow(product),
    },
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
        brandName: brands.name,
        netContentQuantity: products.netContentQuantity,
        netContentUnit: products.netContentUnit,
        weightSource: saleLines.weightSource,
        quantity: sql<number>`sum(${saleLines.quantity})`.mapWith(Number),
        lines: sql<number>`count(*)`.mapWith(Number),
        discounted: sql<number>`sum(${saleLines.discountAmount})`.mapWith(Number),
      })
      .from(saleLines)
      .innerJoin(sales, eq(sales.id, saleLines.saleId))
      .leftJoin(discounts, eq(discounts.id, saleLines.promotionId))
      .leftJoin(products, eq(products.id, discounts.productId))
      .leftJoin(brands, eq(brands.id, products.brandId))
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
        brands.id,
        categories.id,
        tags.id,
        saleLines.weightSource,
      );
    return rows.map((row) => ({
      promotionId: row.promotionId,
      name: row.discount?.name ?? null,
      terms: termsOf(row.discount, row.targetName, row),
      weightSource: storedWeightSource(row.weightSource),
      quantity: row.quantity,
      lines: row.lines,
      discounted: row.discounted,
    }));
  }
}
