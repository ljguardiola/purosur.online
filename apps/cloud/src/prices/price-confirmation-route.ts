import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { auditLog, priceReviews, prices, products } from "../db/schema.js";
import { findProductById } from "../products/product-edit-route.js";
import { checkRequestIsSameOrigin } from "../session/open-session.js";
import {
  openSessionOf,
  originGuard,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../session/route-access.js";
import { branchPriceListId } from "./branch-price-list.js";
import { latestReviewedAt, momentAfter, NEWEST_PRICE_FIRST } from "./current-price.js";
import {
  readRequiredExpectedCurrentPriceId,
  validateConfirmationFields,
} from "./price-validation.js";
import type { PricesRouteOptions } from "./prices-list-route.js";

const NOT_FOUND_RESPONSE = { code: "not_found", message: "no product with that id" } as const;
const STALE_PRICE_RESPONSE = {
  code: "stale_price",
  message: "this product's price was changed since it was loaded",
} as const;
const NO_PRICE_TO_CONFIRM_RESPONSE = {
  code: "no_price_to_confirm",
  message: "this product has no price yet, so there is nothing to confirm",
} as const;

export interface ConfirmPriceInput {
  productId: string;
  priceListId: string;
  expectedCurrentPriceId: string;
  actorId: string;
  now: () => Date;
}

export type ConfirmPriceOutcome =
  | { kind: "not_found" }
  | { kind: "no_price_to_confirm" }
  | { kind: "stale_price" }
  | { kind: "confirmed"; lastReviewedAt: Date };

/**
 * Confirms a product's current price without changing it: inserts a `price_reviews` row pointing
 * at that same price (never a new `prices` row) and an `audit_log` row, in one transaction.
 * Rejected the same way `setPrice` (`price-set-route.ts`) rejects a stale current price, and
 * rejected outright for a product with no price yet, since the issue's own business rules give it
 * nothing to confirm: it can only be priced for the first time.
 */
export async function confirmPrice<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: ConfirmPriceInput,
): Promise<ConfirmPriceOutcome> {
  return db.transaction<ConfirmPriceOutcome>(async (tx) => {
    // Same reasoning as `setPrice`'s own lock: a concurrent price change or confirmation on this
    // product waits instead of racing the current-price read below.
    const [product] = await tx
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, input.productId))
      .for("update");
    if (!product) {
      return { kind: "not_found" };
    }

    const [current] = await tx
      .select({ id: prices.id })
      .from(prices)
      .where(and(eq(prices.productId, input.productId), eq(prices.priceListId, input.priceListId)))
      .orderBy(...NEWEST_PRICE_FIRST)
      .limit(1);

    if (!current) {
      return { kind: "no_price_to_confirm" };
    }
    if (current.id !== input.expectedCurrentPriceId) {
      return { kind: "stale_price" };
    }

    const now = momentAfter(input.now(), [
      await latestReviewedAt(tx, input.productId, input.priceListId),
    ]);

    await tx.insert(priceReviews).values({
      productId: input.productId,
      priceListId: input.priceListId,
      reviewedAt: now,
      actorId: input.actorId,
      priceId: current.id,
    });

    await tx.insert(auditLog).values({
      entity: "product_price_review",
      entityId: input.productId,
      actorId: input.actorId,
      previousValue: null,
      newValue: { priceId: current.id },
    });

    return { kind: "confirmed", lastReviewedAt: now };
  });
}

/**
 * Registers `POST /products/:id/price-confirmation`: the same gate, scope, and no-reauth reasoning
 * `registerPriceSetRoute` (`price-set-route.ts`) documents for `POST /products/:id/price`.
 */
export function registerPriceConfirmationRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PricesRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.post<{ Params: { id: string } }>(
    "/products/:id/price-confirmation",
    {
      preHandler: originGuard((request, reply) =>
        checkRequestIsSameOrigin(request, reply, options.backofficeOrigin),
      ),
      config: { access: permissionAccess("manage_prices_and_review"), sessionSource },
    },
    async (request, reply) => {
      const target = await findProductById(options.db, request.params.id);
      if (!target) {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }

      const expectedCurrentPriceId = readRequiredExpectedCurrentPriceId(request.body);
      const failure = validateConfirmationFields({ expectedCurrentPriceId });
      if (failure) {
        await reply.code(400).send({
          code: "validation_failed",
          message: failure.message,
          details: [{ field: failure.field }],
        });
        return;
      }

      const openSession = openSessionOf(request);
      const priceListId = await branchPriceListId(options.db, openSession.locationId);

      const outcome = await confirmPrice(options.db, {
        productId: target.id,
        priceListId,
        // `validateConfirmationFields` above already guarantees this is defined.
        expectedCurrentPriceId: expectedCurrentPriceId as string,
        actorId: openSession.userId,
        now,
      });

      if (outcome.kind === "not_found") {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }
      if (outcome.kind === "no_price_to_confirm") {
        await reply.code(400).send(NO_PRICE_TO_CONFIRM_RESPONSE);
        return;
      }
      if (outcome.kind === "stale_price") {
        await reply.code(409).send(STALE_PRICE_RESPONSE);
        return;
      }

      await reply.code(200).send({ lastReviewedAt: outcome.lastReviewedAt });
    },
  );
}
