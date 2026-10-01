import { newestPrice, priceReviewAt, type SaleUnit } from "@purosur/domain";
import type {
  CurrentPrice,
  PriceReviewCategory,
  PriceReviewReader,
  PricesUnderReview,
  PricesUnderReviewQuery,
  PriceUnderReview,
} from "@purosur/domain/pricing/use-cases";
import { desc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  branchSettings,
  categories,
  priceReviews,
  prices,
  products,
} from "../platform/db/schema.js";

interface CategoryTreeRow {
  id: string;
  name: string;
  parentId: string | null;
}

function leafCategoryOptions(allCategories: CategoryTreeRow[]): PriceReviewCategory[] {
  const parentIds = new Set(
    allCategories.flatMap((category) => (category.parentId ? [category.parentId] : [])),
  );
  const byId = new Map(allCategories.map((category) => [category.id, category]));
  const labels = new Map<string, string>();

  function pathLabel(categoryId: string, ancestors: ReadonlySet<string>): string {
    const cached = labels.get(categoryId);
    if (cached !== undefined) {
      return cached;
    }
    const category = byId.get(categoryId);
    if (!category) {
      return "";
    }
    const label =
      category.parentId && !ancestors.has(category.parentId)
        ? `${pathLabel(category.parentId, new Set(ancestors).add(categoryId))} › ${category.name}`
        : category.name;
    labels.set(categoryId, label);
    return label;
  }

  return allCategories
    .filter((category) => !parentIds.has(category.id))
    .map((category) => ({ id: category.id, name: pathLabel(category.id, new Set()) }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export class DrizzlePriceReviewReader<TQueryResult extends PgQueryResultHKT>
  implements PriceReviewReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async pricesUnderReview(query: PricesUnderReviewQuery): Promise<PricesUnderReview> {
    const [settings] = await this.db
      .select({
        priceListId: branchSettings.priceListId,
        unreviewedPriceAlertDays: branchSettings.unreviewedPriceAlertDays,
      })
      .from(branchSettings)
      .where(eq(branchSettings.locationId, query.locationId));
    if (!settings) {
      throw new Error(`branch settings missing for location ${query.locationId}`);
    }

    const productRows = await this.db
      .select({
        id: products.id,
        name: products.name,
        categoryId: products.categoryId,
        categoryName: categories.name,
        saleUnit: products.saleUnit,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(eq(products.active, true));

    const priceRows = await this.db
      .select({
        productId: prices.productId,
        id: prices.id,
        unitPrice: prices.unitPrice,
        validFrom: prices.validFrom,
      })
      .from(prices)
      .where(eq(prices.priceListId, settings.priceListId));

    const latestReviewRows = await this.db
      .selectDistinctOn([priceReviews.productId], {
        productId: priceReviews.productId,
        reviewedAt: priceReviews.reviewedAt,
      })
      .from(priceReviews)
      .where(eq(priceReviews.priceListId, settings.priceListId))
      .orderBy(priceReviews.productId, desc(priceReviews.reviewedAt));

    const pricesByProductId = new Map<string, typeof priceRows>();
    for (const row of priceRows) {
      const productPrices = pricesByProductId.get(row.productId);
      if (productPrices) {
        productPrices.push(row);
      } else {
        pricesByProductId.set(row.productId, [row]);
      }
    }
    const currentPriceByProductId = new Map<string, CurrentPrice>();
    for (const [productId, productPrices] of pricesByProductId) {
      const current = newestPrice(productPrices);
      if (current) {
        currentPriceByProductId.set(productId, {
          id: current.id,
          unitPrice: current.unitPrice,
          validFrom: current.validFrom,
        });
      }
    }
    const lastReviewedAtByProductId = new Map<string, Date>(
      latestReviewRows.map((row) => [row.productId, row.reviewedAt]),
    );

    const withReview: PriceUnderReview[] = productRows.map((row) => {
      const lastReviewedAt = lastReviewedAtByProductId.get(row.id) ?? null;
      return {
        id: row.id,
        name: row.name,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        saleUnit: row.saleUnit as SaleUnit,
        currentPrice: currentPriceByProductId.get(row.id) ?? null,
        lastReviewedAt,
        ...priceReviewAt(lastReviewedAt, query.now, settings.unreviewedPriceAlertDays),
      };
    });

    const pendingCountAcrossFullCatalog = withReview.filter((row) => row.pending).length;

    let filtered = withReview;
    if (query.categoryId) {
      filtered = filtered.filter((row) => row.categoryId === query.categoryId);
    }
    if (query.search) {
      const needle = query.search.toLowerCase();
      filtered = filtered.filter((row) => row.name.toLowerCase().includes(needle));
    }
    if (query.review === "pending") {
      filtered = filtered.filter((row) => row.pending);
    }

    const sorted = [...filtered].sort((a, b) => {
      if (query.review === "pending") {
        const aTime = a.lastReviewedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
        const bTime = b.lastReviewedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
        if (aTime !== bTime) {
          return aTime - bTime;
        }
      }
      const nameCompare = a.name.localeCompare(b.name);
      return nameCompare !== 0 ? nameCompare : a.id.localeCompare(b.id);
    });

    const allCategories = await this.db
      .select({ id: categories.id, name: categories.name, parentId: categories.parentId })
      .from(categories);

    return {
      products: sorted,
      categories: leafCategoryOptions(allCategories),
      pendingCount: pendingCountAcrossFullCatalog,
      activeProductCount: withReview.length,
      reviewWindowDays: settings.unreviewedPriceAlertDays,
    };
  }
}
