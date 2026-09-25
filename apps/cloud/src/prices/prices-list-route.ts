import { and, eq, inArray, lte } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { branchSettings, categories, priceReviews, prices, products } from "../db/schema.js";
import type { SaleUnit } from "../products/product-validation.js";
import { checkRequestIsSameOrigin } from "../session/open-session.js";
import {
  openSessionOf,
  originGuard,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../session/route-access.js";
import { UUID_PATTERN } from "./price-validation.js";

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

export interface ListPricesResult {
  products: PriceProductRow[];
  pendingCount: number;
  reviewWindowDays: number;
}

/**
 * A product is pending review when it has never had a review (including never having had a
 * price, per the issue's business rules) or its last review is older than the branch's configured
 * window.
 */
function isPending(
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

/** The most recent (by `validFrom`) row per product id, from rows already scoped to one price list. */
function latestPriceByProductId(
  rows: { productId: string; id: string; unitPrice: number; validFrom: Date }[],
): Map<string, CurrentPriceRow> {
  const latest = new Map<string, CurrentPriceRow>();
  for (const row of rows) {
    const existing = latest.get(row.productId);
    if (!existing || row.validFrom.getTime() > existing.validFrom.getTime()) {
      latest.set(row.productId, { id: row.id, unitPrice: row.unitPrice, validFrom: row.validFrom });
    }
  }
  return latest;
}

/** The most recent (by `reviewedAt`) review per product id, from rows already scoped to one price list. */
function latestReviewByProductId(
  rows: { productId: string; reviewedAt: Date }[],
): Map<string, Date> {
  const latest = new Map<string, Date>();
  for (const row of rows) {
    const existing = latest.get(row.productId);
    if (!existing || row.reviewedAt.getTime() > existing.getTime()) {
      latest.set(row.productId, row.reviewedAt);
    }
  }
  return latest;
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
    .innerJoin(categories, eq(products.categoryId, categories.id));

  const productIds = productRows.map((row) => row.id);

  const priceRows =
    productIds.length === 0
      ? []
      : await db
          .select({
            productId: prices.productId,
            id: prices.id,
            unitPrice: prices.unitPrice,
            validFrom: prices.validFrom,
          })
          .from(prices)
          .where(
            and(
              eq(prices.priceListId, input.priceListId),
              inArray(prices.productId, productIds),
              lte(prices.validFrom, input.now),
            ),
          );

  const reviewRows =
    productIds.length === 0
      ? []
      : await db
          .select({ productId: priceReviews.productId, reviewedAt: priceReviews.reviewedAt })
          .from(priceReviews)
          .where(
            and(
              eq(priceReviews.priceListId, input.priceListId),
              inArray(priceReviews.productId, productIds),
            ),
          );

  const currentPriceByProductId = latestPriceByProductId(priceRows);
  const lastReviewedAtByProductId = latestReviewByProductId(reviewRows);

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

  return {
    products: sorted.map(({ pending: _pending, ...row }) => row),
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
