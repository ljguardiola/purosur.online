import {
  type StockCountList,
  stockCountBodySchema,
  stockCountListSchema,
  stockCountResultSchema,
  stockExpectedBalanceSchema,
} from "@purosur/contracts";
import { expectedBalance, type SaleUnit } from "@purosur/domain";
import { registerCount } from "@purosur/domain/stock/use-cases";
import { and, desc, eq, gte } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../access/backoffice-origin.js";
import {
  openSessionOf,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { categories, products, stockCounts, stockMovements } from "../platform/db/schema.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { DrizzleStockStore } from "./drizzle-stock-store.js";
import { appliedDeltaAfter, currentBalance, isActiveProduct } from "./stock-ledger-queries.js";
import { periodStart } from "./stock-period.js";
import type { StockRouteOptions } from "./stock-route-options.js";

const NOT_FOUND_RESPONSE = { code: "not_found", message: "no product with that id" } as const;
const PART_OF_A_UNIT_RESPONSE = {
  code: "validation_failed",
  message: "a product sold by the unit is counted in whole units",
  details: [{ field: "counted" }],
} as const;
const IN_THE_FUTURE_RESPONSE = {
  code: "occurred_in_the_future",
  message: "a count cannot happen after now",
  details: [{ field: "occurredAt" }],
} as const;
const SAME_MOMENT_RESPONSE = {
  code: "count_at_same_moment",
  message: "this product already has a count at that moment",
  details: [{ field: "occurredAt" }],
} as const;
const INVALID_MOMENT_RESPONSE = {
  code: "validation_failed",
  message: "at must be an ISO date and time",
  details: [{ field: "at" }],
} as const;

async function listStockCounts<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: { locationId: string; since: Date },
): Promise<StockCountList> {
  const rows = await db
    .select({
      id: stockMovements.id,
      productId: stockMovements.productId,
      productName: products.name,
      categoryId: products.categoryId,
      categoryName: categories.name,
      saleUnit: products.saleUnit,
      occurredAt: stockMovements.occurredAt,
      expected: stockCounts.expected,
      counted: stockCounts.counted,
      delta: stockMovements.delta,
      supersededByCountId: stockMovements.supersededByCountId,
    })
    .from(stockMovements)
    .innerJoin(stockCounts, eq(stockCounts.movementId, stockMovements.id))
    .innerJoin(products, eq(products.id, stockMovements.productId))
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(
      and(
        eq(stockMovements.locationId, input.locationId),
        gte(stockMovements.occurredAt, input.since),
      ),
    )
    .orderBy(desc(stockMovements.occurredAt), desc(stockMovements.id));
  return {
    counts: rows.map(({ supersededByCountId, ...row }) => ({
      ...row,
      saleUnit: row.saleUnit as SaleUnit,
      occurredAt: row.occurredAt.toISOString(),
      superseded: supersededByCountId !== null,
    })),
  };
}

export function registerStockCountsRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: StockRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  const ports = { store: new DrizzleStockStore(options.db), clock: { now } };
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const routeConfig = {
    preHandler: sameOriginGuard(options.backofficeOrigin),
    config: { access: permissionAccess("perform_stock_counts"), sessionSource },
  };

  app.get<{ Querystring: { days?: string } }>(
    "/stock/counts",
    routeConfig,
    async (request, reply) => {
      const { locationId } = openSessionOf(request);
      const list = await listStockCounts(options.db, {
        locationId,
        since: periodStart(request.query.days, now()),
      });
      await reply.code(200).send(stockCountListSchema.parse(list));
    },
  );

  app.post("/stock/counts", routeConfig, async (request, reply) => {
    const body = await readValidatedBody(reply, stockCountBodySchema, request.body);
    if (!body) {
      return;
    }
    const openSession = openSessionOf(request);

    const outcome = await registerCount(ports, {
      productId: body.productId,
      locationId: openSession.locationId,
      counted: body.counted,
      occurredAt: new Date(body.occurredAt),
      actorId: openSession.userId,
    });

    if (outcome.kind === "not_found") {
      await reply.code(404).send(NOT_FOUND_RESPONSE);
      return;
    }
    if (outcome.kind === "invalid_quantity") {
      await reply.code(400).send(PART_OF_A_UNIT_RESPONSE);
      return;
    }
    if (outcome.kind === "occurred_in_the_future") {
      await reply.code(400).send(IN_THE_FUTURE_RESPONSE);
      return;
    }
    if (outcome.kind === "count_at_same_moment") {
      await reply.code(409).send(SAME_MOMENT_RESPONSE);
      return;
    }
    await reply.code(200).send(
      stockCountResultSchema.parse({
        expected: outcome.expected,
        delta: outcome.delta,
        balance: outcome.balance,
        superseded: outcome.supersededByCountId !== null,
      }),
    );
  });

  app.get<{ Params: { id: string }; Querystring: { at?: string } }>(
    "/stock/products/:id/expected-balance",
    routeConfig,
    async (request, reply) => {
      const productId = request.params.id;
      if (!(await isActiveProduct(options.db, productId))) {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }
      const at = stockCountBodySchema.shape.occurredAt.safeParse(request.query.at);
      if (!at.success) {
        await reply.code(400).send(INVALID_MOMENT_RESPONSE);
        return;
      }
      const key = { productId, locationId: openSessionOf(request).locationId };
      const expected = expectedBalance({
        balance: await currentBalance(options.db, key),
        appliedAfterCount: await appliedDeltaAfter(options.db, key, new Date(at.data)),
      });
      await reply.code(200).send(stockExpectedBalanceSchema.parse({ expected }));
    },
  );
}
