import { priceListSchema } from "@purosur/contracts";
import { newestPrice, type SaleUnit } from "@purosur/domain";
import { desc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../access/backoffice-origin.js";
import {
  openSessionOf,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import {
  branchSettings,
  categories,
  priceReviews,
  prices,
  products,
} from "../platform/db/schema.js";
import { UUID_PATTERN } from "../platform/db/uuid-pattern.js";

export interface PricesRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now?: () => Date;
}

interface CurrentPriceRow {
  id: string;
  unitPrice: number;
  validFrom: Date;
}

interface PriceProductRow {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  saleUnit: SaleUnit;
  currentPrice: CurrentPriceRow | null;
  lastReviewedAt: Date | null;
  pending: boolean;
}

type ReviewFilter = "pending" | "all";

export interface ListPricesInput {
  priceListId: string;
  now: Date;
  unreviewedPriceAlertDays: number;
  review: ReviewFilter;
  categoryId?: string;
  search?: string;
}

interface PriceCategoryOption {
  id: string;
  name: string;
}

export interface ListPricesResult {
  products: PriceProductRow[];
  categories: PriceCategoryOption[];
  pendingCount: number;
  activeProductCount: number;
  reviewWindowDays: number;
}

interface CategoryTreeRow {
  id: string;
  name: string;
  parentId: string | null;
}

function leafCategoryOptions(allCategories: CategoryTreeRow[]): PriceCategoryOption[] {
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

export function isPending(
  lastReviewedAt: Date | null,
  now: Date,
  unreviewedPriceAlertDays: number,
): boolean {
  if (!lastReviewedAt) {
    return true;
  }
  const cutoff = now.getTime() - unreviewedPriceAlertDays * 24 * 60 * 60 * 1000;
  return lastReviewedAt.getTime() < cutoff;
}

export async function listPrices<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: ListPricesInput,
): Promise<ListPricesResult> {
  const productRows = await db
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

  const priceRows = await db
    .select({
      productId: prices.productId,
      id: prices.id,
      unitPrice: prices.unitPrice,
      validFrom: prices.validFrom,
    })
    .from(prices)
    .where(eq(prices.priceListId, input.priceListId));

  const latestReviewRows = await db
    .selectDistinctOn([priceReviews.productId], {
      productId: priceReviews.productId,
      reviewedAt: priceReviews.reviewedAt,
    })
    .from(priceReviews)
    .where(eq(priceReviews.priceListId, input.priceListId))
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
  const currentPriceByProductId = new Map<string, CurrentPriceRow>();
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

  const withDerived = productRows.map((row) => {
    const lastReviewedAt = lastReviewedAtByProductId.get(row.id) ?? null;
    return {
      id: row.id,
      name: row.name,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      saleUnit: row.saleUnit as SaleUnit,
      currentPrice: currentPriceByProductId.get(row.id) ?? null,
      lastReviewedAt,
      pending: isPending(lastReviewedAt, input.now, input.unreviewedPriceAlertDays),
    };
  });

  const pendingCountAcrossFullCatalog = withDerived.filter((row) => row.pending).length;

  let filtered = withDerived;
  if (input.categoryId) {
    filtered = filtered.filter((row) => row.categoryId === input.categoryId);
  }
  if (input.search) {
    const needle = input.search.toLowerCase();
    filtered = filtered.filter((row) => row.name.toLowerCase().includes(needle));
  }
  if (input.review === "pending") {
    filtered = filtered.filter((row) => row.pending);
  }

  const sorted = [...filtered].sort((a, b) => {
    if (input.review === "pending") {
      const aTime = a.lastReviewedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
      const bTime = b.lastReviewedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
      if (aTime !== bTime) {
        return aTime - bTime;
      }
    }
    const nameCompare = a.name.localeCompare(b.name);
    return nameCompare !== 0 ? nameCompare : a.id.localeCompare(b.id);
  });

  const allCategories = await db
    .select({ id: categories.id, name: categories.name, parentId: categories.parentId })
    .from(categories);

  return {
    products: sorted,
    categories: leafCategoryOptions(allCategories),
    pendingCount: pendingCountAcrossFullCatalog,
    activeProductCount: withDerived.length,
    reviewWindowDays: input.unreviewedPriceAlertDays,
  };
}

function toPriceListBody(result: ListPricesResult) {
  return priceListSchema.parse({
    ...result,
    products: result.products.map((product) => ({
      ...product,
      currentPrice: product.currentPrice && {
        ...product.currentPrice,
        validFrom: product.currentPrice.validFrom.toISOString(),
      },
      lastReviewedAt: product.lastReviewedAt?.toISOString() ?? null,
    })),
  });
}

function readReviewFilter(value: unknown): ReviewFilter {
  return value === "pending" ? "pending" : "all";
}

function readCategoryIdFilter(value: unknown): string | undefined {
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : undefined;
}

function readSearchFilter(value: unknown): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : undefined;
}

export function registerPricesListRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PricesRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get<{ Querystring: { review?: string; categoryId?: string; search?: string } }>(
    "/prices",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: permissionAccess("manage_prices_and_review"), sessionSource },
    },
    async (request, reply) => {
      const openSession = openSessionOf(request);
      const attemptedAt = now();

      const [settings] = await options.db
        .select({
          priceListId: branchSettings.priceListId,
          unreviewedPriceAlertDays: branchSettings.unreviewedPriceAlertDays,
        })
        .from(branchSettings)
        .where(eq(branchSettings.locationId, openSession.locationId));
      if (!settings) {
        throw new Error(`branch settings missing for location ${openSession.locationId}`);
      }

      const categoryId = readCategoryIdFilter(request.query.categoryId);
      const search = readSearchFilter(request.query.search);
      const result = await listPrices(options.db, {
        priceListId: settings.priceListId,
        now: attemptedAt,
        unreviewedPriceAlertDays: settings.unreviewedPriceAlertDays,
        review: readReviewFilter(request.query.review),
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(search !== undefined ? { search } : {}),
      });

      await reply.code(200).send(toPriceListBody(result));
    },
  );
}
