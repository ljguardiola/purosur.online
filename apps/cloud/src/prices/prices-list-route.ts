import { desc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { branchSettings, categories, priceReviews, prices, products } from "../db/schema.js";
import { UUID_PATTERN } from "../db/uuid-pattern.js";
import type { SaleUnit } from "../products/product-validation.js";
import { checkRequestIsSameOrigin } from "../session/open-session.js";
import {
  openSessionOf,
  originGuard,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../session/route-access.js";
import { NEWEST_PRICE_FIRST } from "./current-price.js";

export interface PricesRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  /** Injected in tests so idle/absolute expiry, and "now" for the pending window, are deterministic. */
  now?: () => Date;
}

export interface CurrentPriceRow {
  id: string;
  unitPrice: number;
  validFrom: Date;
}

export interface PriceProductRow {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  saleUnit: SaleUnit;
  currentPrice: CurrentPriceRow | null;
  lastReviewedAt: Date | null;
  pending: boolean;
}

export type ReviewFilter = "pending" | "all";

export interface ListPricesInput {
  priceListId: string;
  now: Date;
  unreviewedPriceAlertDays: number;
  review: ReviewFilter;
  categoryId?: string;
  search?: string;
}

export interface PriceCategoryOption {
  id: string;
  name: string;
}

export interface ListPricesResult {
  products: PriceProductRow[];
  /**
   * Every leaf category (the only kind a product can be assigned to) to filter the list by,
   * labeled with its full path ("Almacén › Fiambres") since nesting can put two leaves under the
   * same name. `GET /categories` is gated by `manage_products_and_categories`, which a role
   * holding only `manage_prices_and_review` lacks, so this route reads the category tree itself
   * instead of asking the backoffice to fetch it separately.
   */
  categories: PriceCategoryOption[];
  pendingCount: number;
  reviewWindowDays: number;
}

interface CategoryTreeRow {
  id: string;
  name: string;
  parentId: string | null;
}

// A parent category can never hold a product directly (enforced on write by
// `lockLeafCategory`'s "category_not_leaf" rejection), so offering it as a filter option would
// only ever narrow the list to nothing; only a leaf's own path is worth offering.
function leafCategoryOptions(allCategories: CategoryTreeRow[]): PriceCategoryOption[] {
  const parentIds = new Set(
    allCategories.flatMap((category) => (category.parentId ? [category.parentId] : [])),
  );
  const byId = new Map(allCategories.map((category) => [category.id, category]));
  // An ancestor's label is shared by every one of its descendants, so each is built only once.
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
    // The move rules reject a cycle before it is saved, but stopping here instead of recursing
    // forever keeps a corrupt row from failing the whole list.
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

/**
 * A product is pending review when it has never had a review (including never having had a
 * price, per the issue's business rules) or its last review is older than the branch's configured
 * window.
 */
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

/**
 * Lists every product with its current price (in `priceListId`) and last review, scoped to that
 * one price list. The pending count is computed over the whole catalog before `categoryId` or
 * `search` narrow it, so the backoffice can show "N productos sin revisar" next to a filtered list
 * without a second request.
 */
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

  const latestPriceRows = await db
    .selectDistinctOn([prices.productId], {
      productId: prices.productId,
      id: prices.id,
      unitPrice: prices.unitPrice,
      validFrom: prices.validFrom,
    })
    .from(prices)
    .where(eq(prices.priceListId, input.priceListId))
    .orderBy(prices.productId, ...NEWEST_PRICE_FIRST);

  const latestReviewRows = await db
    .selectDistinctOn([priceReviews.productId], {
      productId: priceReviews.productId,
      reviewedAt: priceReviews.reviewedAt,
    })
    .from(priceReviews)
    .where(eq(priceReviews.priceListId, input.priceListId))
    .orderBy(priceReviews.productId, desc(priceReviews.reviewedAt));

  const currentPriceByProductId = new Map<string, CurrentPriceRow>(
    latestPriceRows.map((row) => [
      row.productId,
      { id: row.id, unitPrice: row.unitPrice, validFrom: row.validFrom },
    ]),
  );
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

  const pendingCount = withDerived.filter((row) => row.pending).length;

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
    pendingCount,
    reviewWindowDays: input.unreviewedPriceAlertDays,
  };
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

/**
 * Registers `GET /prices`: gated by `manage_prices_and_review` (an Administrator always holds it
 * too), scoped to the session's own branch and the price list its settings point at. `review`
 * defaults to `all` when omitted or unrecognized; the backoffice's own default view
 * (`review=pending`) is a frontend choice, not this endpoint's.
 */
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
      preHandler: originGuard((request, reply) =>
        checkRequestIsSameOrigin(request, reply, options.backofficeOrigin),
      ),
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
        // Every location gets its row from the migration that creates `branch_settings`
        // (`branch-settings-read-route.ts` gives the same reasoning); an open session's own
        // location missing one would mean that invariant broke, not a legitimate case this route
        // should see.
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

      await reply.code(200).send(result);
    },
  );
}
