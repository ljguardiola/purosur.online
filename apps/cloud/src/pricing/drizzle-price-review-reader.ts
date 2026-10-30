import { priceReviewAt, type SaleUnit } from "@purosur/domain";
import type {
  PriceReviewCategory,
  PriceReviewHistories,
  PriceReviewReader,
  PricesUnderReview,
  PricesUnderReviewQuery,
  PriceUnderReview,
} from "@purosur/domain/pricing/use-cases";
import { formatProductDescription, textContainsEveryWord } from "@purosur/formatting";
import { and, desc, eq, isNull, min } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { netContentRow } from "../catalog/net-content-row.js";
import {
  branchSettings,
  brands,
  categories,
  priceReviewPostponements,
  priceReviews,
  products,
} from "../platform/db/schema.js";
import { newestPricesOfList } from "./newest-prices-of-list.js";

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

  async priceReviewHistories(locationId: string): Promise<PriceReviewHistories> {
    const settings = await this.branchSettingsOf(locationId);
    const productRows = await this.activeProductRows();
    const currentPriceByProductId = await newestPricesOfList(
      this.db,
      settings.priceListId,
      "active-products",
    );
    const lastReviewedAtByProductId = await this.lastReviewedAtByProductId(settings.priceListId);
    const postponedRows = await this.db
      .select({
        productId: priceReviewPostponements.productId,
        earliestPostponedAt: min(priceReviewPostponements.postponedAt),
      })
      .from(priceReviewPostponements)
      .where(
        and(
          eq(priceReviewPostponements.priceListId, settings.priceListId),
          isNull(priceReviewPostponements.resolvedByReviewId),
        ),
      )
      .groupBy(priceReviewPostponements.productId);
    const earliestPostponedAtByProductId = new Map(
      postponedRows.map((row) => [row.productId, row.earliestPostponedAt]),
    );

    return {
      reviewWindowDays: settings.unreviewedPriceAlertDays,
      products: productRows.map((row) => ({
        id: row.id,
        name: row.name,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        brandName: row.brandName,
        netContent: netContentRow(row),
        saleUnit: row.saleUnit as SaleUnit,
        currentPrice: currentPriceByProductId.get(row.id) ?? null,
        lastReviewedAt: lastReviewedAtByProductId.get(row.id) ?? null,
        earliestPostponedAt: earliestPostponedAtByProductId.get(row.id) ?? null,
      })),
    };
  }

  private async branchSettingsOf(locationId: string) {
    const [settings] = await this.db
      .select({
        priceListId: branchSettings.priceListId,
        unreviewedPriceAlertDays: branchSettings.unreviewedPriceAlertDays,
      })
      .from(branchSettings)
      .where(eq(branchSettings.locationId, locationId));
    if (!settings) {
      throw new Error(`branch settings missing for location ${locationId}`);
    }
    return settings;
  }

  private activeProductRows() {
    return this.db
      .select({
        id: products.id,
        name: products.name,
        categoryId: products.categoryId,
        categoryName: categories.name,
        brandName: brands.name,
        netContentQuantity: products.netContentQuantity,
        netContentUnit: products.netContentUnit,
        saleUnit: products.saleUnit,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(brands, eq(brands.id, products.brandId))
      .where(eq(products.active, true));
  }

  private async lastReviewedAtByProductId(priceListId: string): Promise<Map<string, Date>> {
    const latestReviewRows = await this.db
      .selectDistinctOn([priceReviews.productId], {
        productId: priceReviews.productId,
        reviewedAt: priceReviews.reviewedAt,
      })
      .from(priceReviews)
      .where(eq(priceReviews.priceListId, priceListId))
      .orderBy(priceReviews.productId, desc(priceReviews.reviewedAt));
    return new Map(latestReviewRows.map((row) => [row.productId, row.reviewedAt]));
  }

  async pricesUnderReview(query: PricesUnderReviewQuery): Promise<PricesUnderReview> {
    const settings = await this.branchSettingsOf(query.locationId);
    const productRows = await this.activeProductRows();

    const currentPriceByProductId = await newestPricesOfList(
      this.db,
      settings.priceListId,
      "active-products",
    );

    const postponedRows = await this.db
      .selectDistinct({ productId: priceReviewPostponements.productId })
      .from(priceReviewPostponements)
      .where(
        and(
          eq(priceReviewPostponements.priceListId, settings.priceListId),
          isNull(priceReviewPostponements.resolvedByReviewId),
        ),
      );

    const lastReviewedAtByProductId = await this.lastReviewedAtByProductId(settings.priceListId);

    const postponedProductIds = new Set(postponedRows.map((row) => row.productId));

    const withReview: PriceUnderReview[] = productRows.map((row) => ({
      id: row.id,
      name: row.name,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      brandName: row.brandName,
      netContent: netContentRow(row),
      saleUnit: row.saleUnit as SaleUnit,
      currentPrice: currentPriceByProductId.get(row.id) ?? null,
      ...priceReviewAt(
        {
          lastReviewedAt: lastReviewedAtByProductId.get(row.id) ?? null,
          reviewPostponed: postponedProductIds.has(row.id),
        },
        query.now,
        settings.unreviewedPriceAlertDays,
      ),
    }));

    const pendingCountAcrossFullCatalog = withReview.filter((row) => row.pending).length;

    let filtered = withReview;
    const categoryId = query.categoryId;
    if (categoryId !== undefined) {
      filtered = filtered.filter((row) => row.categoryId === categoryId);
    }
    const productIds = query.productIds;
    if (productIds !== undefined) {
      const wanted = new Set(productIds);
      filtered = filtered.filter((row) => wanted.has(row.id));
    }
    const search = query.search;
    if (search) {
      filtered = filtered.filter((row) =>
        textContainsEveryWord(formatProductDescription(row), search),
      );
    }
    if (query.review === "pending") {
      filtered = filtered.filter((row) => row.pending);
    }

    const sorted = [...filtered].sort((a, b) => {
      if (query.review === "pending") {
        const aTime = lastReviewedAtByProductId.get(a.id)?.getTime() ?? Number.NEGATIVE_INFINITY;
        const bTime = lastReviewedAtByProductId.get(b.id)?.getTime() ?? Number.NEGATIVE_INFINITY;
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
