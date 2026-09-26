import { and, desc, eq } from "drizzle-orm";
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
import {
  readExpectedCurrentPriceId,
  readUnitPrice,
  validateSetPriceFields,
} from "./price-validation.js";
import type { PricesRouteOptions } from "./prices-list-route.js";

const NOT_FOUND_RESPONSE = { code: "not_found", message: "no product with that id" } as const;
const STALE_PRICE_RESPONSE = {
  code: "stale_price",
  message: "this product's price was changed since it was loaded",
} as const;
const PRICE_UNCHANGED_RESPONSE = {
  code: "price_unchanged",
  message: "the new price is the same as the current one; confirm it instead of changing it",
  details: [{ field: "unitPrice" }],
} as const;

export interface SetPricePriceRow {
  id: string;
  unitPrice: number;
  validFrom: Date;
}

export interface SetPriceInput {
  productId: string;
  priceListId: string;
  unitPrice: number;
  /** `null` means the caller saw no current price; the product's most recent price otherwise. */
  expectedCurrentPriceId: string | null;
  actorId: string;
  /**
   * Read only once the product row is locked, so the moment recorded is never earlier than a
   * change another caller committed before this one got the lock.
   */
  now: () => Date;
}

export type SetPriceOutcome =
  | { kind: "not_found" }
  | { kind: "stale_price" }
  | { kind: "price_unchanged" }
  | { kind: "applied"; price: SetPricePriceRow; lastReviewedAt: Date };

/**
 * Sets a product's price: inserts a new, append-only `prices` row and a `price_reviews` row
 * pointing at it (setting a price always counts as reviewing it), and an `audit_log` row, all in
 * one transaction. Rejects a save made over a current price the caller didn't see
 * (`expectedCurrentPriceId`, including a product just priced by someone else since) the same way
 * `editProduct` (`product-edit-route.ts`) rejects a stale product version, and rejects setting the
 * exact same price the product already carries, since confirming it without a change is a
 * separate, cheaper action (`price-confirmation-route.ts`).
 */
export async function setPrice<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: SetPriceInput,
): Promise<SetPriceOutcome> {
  return db.transaction<SetPriceOutcome>(async (tx) => {
    // Locks this one product row so a concurrent price change on it waits instead of racing: the
    // current-price read below, and the write it may lead to, both happen against a value that
    // cannot change out from under this transaction while it holds the lock.
    const [product] = await tx
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, input.productId))
      .for("update");
    if (!product) {
      return { kind: "not_found" };
    }
    const now = input.now();

    const [current] = await tx
      .select({ id: prices.id, unitPrice: prices.unitPrice })
      .from(prices)
      .where(and(eq(prices.productId, input.productId), eq(prices.priceListId, input.priceListId)))
      .orderBy(desc(prices.validFrom))
      .limit(1);

    const currentId = current?.id ?? null;
    if (currentId !== input.expectedCurrentPriceId) {
      return { kind: "stale_price" };
    }
    if (current && current.unitPrice === input.unitPrice) {
      return { kind: "price_unchanged" };
    }

    const [newPrice] = await tx
      .insert(prices)
      .values({
        productId: input.productId,
        priceListId: input.priceListId,
        unitPrice: input.unitPrice,
        validFrom: now,
      })
      .returning({ id: prices.id, unitPrice: prices.unitPrice, validFrom: prices.validFrom });
    if (!newPrice) {
      throw new Error("inserting the new price returned no row");
    }

    await tx.insert(priceReviews).values({
      productId: input.productId,
      priceListId: input.priceListId,
      reviewedAt: now,
      actorId: input.actorId,
      priceId: newPrice.id,
    });

    await tx.insert(auditLog).values({
      entity: "product_price",
      entityId: input.productId,
      actorId: input.actorId,
      previousValue: current ? { priceId: current.id, unitPrice: current.unitPrice } : null,
      newValue: { priceId: newPrice.id, unitPrice: newPrice.unitPrice },
    });

    return { kind: "applied", price: newPrice, lastReviewedAt: now };
  });
}

/**
 * Registers `POST /products/:id/price`: gated by `manage_prices_and_review` (an Administrator
 * always holds it too), scoped to the price list the session's own branch works on. Like
 * `product-edit-route.ts`, this needs no passkey step-up: pricing is routine daily work, not a
 * sensitive account or role action.
 */
export function registerPriceSetRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PricesRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.post<{ Params: { id: string } }>(
    "/products/:id/price",
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

      const unitPrice = readUnitPrice(request.body);
      const expectedCurrentPriceId = readExpectedCurrentPriceId(request.body);
      const failure = validateSetPriceFields({ unitPrice, expectedCurrentPriceId });
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

      const outcome = await setPrice(options.db, {
        productId: target.id,
        priceListId,
        // `validateSetPriceFields` above already guarantees both are defined.
        unitPrice: unitPrice as number,
        expectedCurrentPriceId: expectedCurrentPriceId as string | null,
        actorId: openSession.userId,
        now,
      });

      if (outcome.kind === "not_found") {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }
      if (outcome.kind === "stale_price") {
        await reply.code(409).send(STALE_PRICE_RESPONSE);
        return;
      }
      if (outcome.kind === "price_unchanged") {
        await reply.code(400).send(PRICE_UNCHANGED_RESPONSE);
        return;
      }

      await reply.code(200).send({ price: outcome.price, lastReviewedAt: outcome.lastReviewedAt });
    },
  );
}
