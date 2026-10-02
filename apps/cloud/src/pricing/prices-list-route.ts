import { priceListSchema } from "@purosur/contracts";
import type { PriceReviewFilter, PricesUnderReview } from "@purosur/domain/pricing/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../access/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { DrizzlePriceReviewReader } from "./drizzle-price-review-reader.js";

export interface PricesRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now?: () => Date;
}

function toPriceListBody(result: PricesUnderReview) {
  return priceListSchema.parse({
    ...result,
    products: result.products.map((product) => ({
      ...product,
      currentPrice: product.currentPrice && {
        ...product.currentPrice,
        validFrom: product.currentPrice.validFrom.toISOString(),
      },
    })),
  });
}

function readReviewFilter(value: unknown): PriceReviewFilter {
  return value === "pending" ? "pending" : "all";
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
  const reader = new DrizzlePriceReviewReader(options.db);
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get<{ Querystring: { review?: string; categoryId?: string; search?: string } }>(
    "/prices",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("prices_area"), sessionSource },
    },
    async (request, reply) => {
      const { categoryId } = request.query;
      const search = readSearchFilter(request.query.search);
      const result = await reader.pricesUnderReview({
        locationId: openSessionOf(request).locationId,
        now: now(),
        review: readReviewFilter(request.query.review),
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(search !== undefined ? { search } : {}),
      });

      await reply.code(200).send(toPriceListBody(result));
    },
  );
}
