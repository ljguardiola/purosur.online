import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { checkRequestIsSameOrigin } from "../access/open-session.js";
import {
  openSessionOf,
  originGuard,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { auditLog, priceReviews, prices, products } from "../platform/db/schema.js";
import { findActiveProductById } from "./active-product.js";
import { branchPriceListId } from "./branch-price-list.js";
import { latestReviewedAt, momentAfter, NEWEST_PRICE_FIRST } from "./current-price.js";
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
  expectedCurrentPriceId: string | null;
  actorId: string;
  now: () => Date;
}

export type SetPriceOutcome =
  | { kind: "not_found" }
  | { kind: "stale_price" }
  | { kind: "price_unchanged" }
  | { kind: "applied"; price: SetPricePriceRow; lastReviewedAt: Date };

export async function setPrice<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: SetPriceInput,
): Promise<SetPriceOutcome> {
  return db.transaction<SetPriceOutcome>(async (tx) => {
    // Locks the product row so a concurrent price change waits instead of racing the current-price
    // read below and the write it may lead to.
    const [product] = await tx
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, input.productId), eq(products.active, true)))
      .for("update");
    if (!product) {
      return { kind: "not_found" };
    }

    const [current] = await tx
      .select({ id: prices.id, unitPrice: prices.unitPrice, validFrom: prices.validFrom })
      .from(prices)
      .where(and(eq(prices.productId, input.productId), eq(prices.priceListId, input.priceListId)))
      .orderBy(...NEWEST_PRICE_FIRST)
      .limit(1);

    const currentId = current?.id ?? null;
    if (currentId !== input.expectedCurrentPriceId) {
      return { kind: "stale_price" };
    }
    if (current && current.unitPrice === input.unitPrice) {
      return { kind: "price_unchanged" };
    }

    const now = momentAfter(input.now(), [
      current?.validFrom,
      await latestReviewedAt(tx, input.productId, input.priceListId),
    ]);

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

// No passkey step-up: pricing is routine daily work, not a sensitive account or role action.
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
      const target = await findActiveProductById(options.db, request.params.id);
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
