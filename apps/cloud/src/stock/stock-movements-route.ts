import {
  stockAdjustmentBodySchema,
  stockLossBodySchema,
  stockMovementListSchema,
  stockMovementResultSchema,
} from "@purosur/contracts";
import {
  type ManualStockMovementKind,
  type RecordAdjustmentOutcome,
  type RecordLossOutcome,
  recordAdjustment,
  recordLoss,
} from "@purosur/domain/stock/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply } from "fastify";
import { sameOriginGuard } from "../access/backoffice-origin.js";
import {
  isAccessGranted,
  openSessionOf,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { DrizzleStockReader } from "./drizzle-stock-reader.js";
import { DrizzleStockStore } from "./drizzle-stock-store.js";
import { periodStart } from "./stock-period.js";
import type { StockRouteOptions } from "./stock-route-options.js";

const NOT_FOUND_RESPONSE = { code: "not_found", message: "no product with that id" } as const;
const PART_OF_A_UNIT_RESPONSE = {
  code: "validation_failed",
  message: "a product sold by the unit moves in whole units",
  details: [{ field: "quantity" }],
} as const;
const DIRECTION_NOT_ALLOWED_RESPONSE = {
  code: "validation_failed",
  message: "this reason only subtracts",
  details: [{ field: "direction" }],
} as const;

async function sendMovementOutcome(
  reply: FastifyReply,
  outcome: RecordLossOutcome | RecordAdjustmentOutcome,
): Promise<void> {
  if (outcome.kind === "not_found") {
    await reply.code(404).send(NOT_FOUND_RESPONSE);
    return;
  }
  if (outcome.kind === "invalid_quantity") {
    await reply.code(400).send(PART_OF_A_UNIT_RESPONSE);
    return;
  }
  if (outcome.kind === "direction_not_allowed") {
    await reply.code(400).send(DIRECTION_NOT_ALLOWED_RESPONSE);
    return;
  }
  await reply.code(200).send(
    stockMovementResultSchema.parse({
      balance: outcome.balance,
      superseded: outcome.supersededByCountId !== null,
    }),
  );
}

export function registerStockMovementsRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: StockRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  const ports = { store: new DrizzleStockStore(options.db), clock: { now } };
  const reader = new DrizzleStockReader(options.db);
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const preHandler = sameOriginGuard(options.backofficeOrigin);
  const lossAccess = permissionAccess("record_stock_losses");
  const adjustmentAccess = permissionAccess("adjust_stock");

  app.get<{ Querystring: { days?: string } }>(
    "/inventory-movements",
    {
      preHandler,
      config: {
        access: permissionAccess(["record_stock_losses", "adjust_stock"]),
        sessionSource,
      },
    },
    async (request, reply) => {
      const openSession = openSessionOf(request);
      const kinds: ManualStockMovementKind[] = [
        ...(isAccessGranted(lossAccess, openSession) ? (["loss"] as const) : []),
        ...(isAccessGranted(adjustmentAccess, openSession) ? (["adjustment"] as const) : []),
      ];
      const movements = await reader.movements({
        locationId: openSession.locationId,
        since: periodStart(request.query.days, now()),
        kinds,
      });
      await reply.code(200).send(
        stockMovementListSchema.parse({
          movements: movements.map((movement) => ({
            ...movement,
            occurredAt: movement.occurredAt.toISOString(),
          })),
        }),
      );
    },
  );

  app.post(
    "/inventory-losses",
    { preHandler, config: { access: lossAccess, sessionSource } },
    async (request, reply) => {
      const body = await readValidatedBody(reply, stockLossBodySchema, request.body);
      if (!body) {
        return;
      }
      const openSession = openSessionOf(request);
      const outcome = await recordLoss(ports, {
        ...body,
        locationId: openSession.locationId,
        actorId: openSession.userId,
      });
      await sendMovementOutcome(reply, outcome);
    },
  );

  app.post(
    "/inventory-adjustments",
    { preHandler, config: { access: adjustmentAccess, sessionSource } },
    async (request, reply) => {
      const body = await readValidatedBody(reply, stockAdjustmentBodySchema, request.body);
      if (!body) {
        return;
      }
      const openSession = openSessionOf(request);
      const outcome = await recordAdjustment(ports, {
        ...body,
        locationId: openSession.locationId,
        actorId: openSession.userId,
      });
      await sendMovementOutcome(reply, outcome);
    },
  );
}
