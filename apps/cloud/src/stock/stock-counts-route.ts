import {
  stockCountBodySchema,
  stockCountListSchema,
  stockCountResultSchema,
  stockProductBalanceSchema,
} from "@purosur/contracts";
import { expectedBalanceAt, registerCount } from "@purosur/domain/stock/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readRecordIds } from "../platform/record-id-params.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleStockReader } from "./drizzle-stock-reader.js";
import { DrizzleStockStore } from "./drizzle-stock-store.js";
import { periodStart } from "./stock-period.js";
import type { StockRouteOptions } from "./stock-route-options.js";

const NOT_FOUND_RESPONSE = { code: "not_found", message: "no product with that id" } as const;
const PART_OF_A_UNIT_RESPONSE = {
  code: "validation_failed",
  message: "a product sold by the unit is counted in whole units",
  details: [{ field: "counted" }],
} as const;
const PART_OF_A_UNIT_LOT_RESPONSE = {
  code: "validation_failed",
  message: "a product sold by the unit is counted in whole units",
  details: [{ field: "lots" }],
} as const;
const INVALID_LOT_RESPONSE = {
  code: "validation_failed",
  message: "lots must be lots of the product that held stock at the moment of the count",
  details: [{ field: "lots" }],
} as const;
const REPEATED_LOT_RESPONSE = {
  code: "validation_failed",
  message: "lots must not list a lot twice",
  details: [{ field: "lots" }],
} as const;
const AMBIGUOUS_COUNT_RESPONSE = {
  code: "validation_failed",
  message: "a count gives either a counted quantity or the lots counted",
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

export function registerStockCountsRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: StockRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  const ports = { store: new DrizzleStockStore(options.db), clock: { now } };
  const reader = new DrizzleStockReader(options.db);
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const routeConfig = {
    preHandler: sameOriginGuard(options.backofficeOrigin),
    config: { access: capabilityAccess("stock_counts"), sessionSource },
  };

  app.get<{ Querystring: { days?: string } }>(
    "/inventory-counts",
    routeConfig,
    async (request, reply) => {
      const { locationId } = openSessionOf(request);
      const counts = await reader.counts({
        locationId,
        since: periodStart(request.query.days, now()),
      });
      await reply.code(200).send(
        stockCountListSchema.parse({
          counts: counts.map((count) => ({
            ...count,
            occurredAt: count.occurredAt.toISOString(),
          })),
        }),
      );
    },
  );

  app.post("/inventory-counts", routeConfig, async (request, reply) => {
    const body = await readValidatedBody(reply, stockCountBodySchema, request.body);
    if (!body) {
      return;
    }
    const openSession = openSessionOf(request);

    const outcome = await registerCount(ports, {
      productId: body.productId,
      locationId: openSession.locationId,
      ...(body.counted === undefined ? {} : { counted: body.counted }),
      ...(body.lots === undefined ? {} : { lots: body.lots }),
      occurredAt: new Date(body.occurredAt),
      actorId: openSession.userId,
    });

    if (outcome.kind === "not_found") {
      await reply.code(404).send(NOT_FOUND_RESPONSE);
      return;
    }
    if (outcome.kind === "invalid_quantity") {
      await reply
        .code(400)
        .send(body.lots === undefined ? PART_OF_A_UNIT_RESPONSE : PART_OF_A_UNIT_LOT_RESPONSE);
      return;
    }
    if (outcome.kind === "invalid_lot") {
      await reply.code(400).send(INVALID_LOT_RESPONSE);
      return;
    }
    if (outcome.kind === "repeated_lot") {
      await reply.code(400).send(REPEATED_LOT_RESPONSE);
      return;
    }
    if (outcome.kind === "ambiguous_count") {
      await reply.code(400).send(AMBIGUOUS_COUNT_RESPONSE);
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

  app.get<{ Querystring: { at?: string } }>(
    "/inventory-levels/:productId",
    {
      preHandler: routeConfig.preHandler,
      config: { access: capabilityAccess("stock_balances"), sessionSource },
    },
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["productId"]);
      if (!ids) {
        return;
      }
      const at = stockCountBodySchema.shape.occurredAt.safeParse(request.query.at);
      const outcome = await expectedBalanceAt(
        { ledger: reader },
        {
          productId: ids.productId,
          locationId: openSessionOf(request).locationId,
          at: at.success ? new Date(at.data) : undefined,
        },
      );
      if (outcome.kind === "not_found") {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }
      if (outcome.kind === "invalid_moment") {
        await reply.code(400).send(INVALID_MOMENT_RESPONSE);
        return;
      }
      await reply.code(200).send(
        stockProductBalanceSchema.parse({
          ...outcome.product,
          balance: outcome.balance,
          lots: outcome.lots,
        }),
      );
    },
  );
}
