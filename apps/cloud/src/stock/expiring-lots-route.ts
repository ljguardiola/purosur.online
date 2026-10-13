import { expiredLotDiscardResultSchema, expiringLotListSchema } from "@purosur/contracts";
import { discardExpiredLot, readExpiringLots } from "@purosur/domain/stock/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { DrizzleBranchSettingsReader } from "../branch/drizzle-branch-settings-reader.js";
import { readRecordIds } from "../platform/record-id-params.js";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleExpiringLotReader } from "./drizzle-expiring-lot-reader.js";
import { DrizzleStockStore } from "./drizzle-stock-store.js";
import type { StockRouteOptions } from "./stock-route-options.js";

const NOT_FOUND_RESPONSE = { code: "not_found", message: "no lot with that id" } as const;
const NOT_EXPIRED_RESPONSE = {
  code: "lot_not_expired",
  message: "only an expired lot is discarded",
} as const;
const EMPTY_RESPONSE = { code: "lot_empty", message: "the lot has no stock left" } as const;

export function registerExpiringLotsRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: StockRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  const clock = { now };
  const expiringLots = new DrizzleExpiringLotReader(options.db);
  const branchSettings = new DrizzleBranchSettingsReader(options.db);
  const store = new DrizzleStockStore(options.db);
  registerRouteAccess(app);
  const routeConfig = {
    preHandler: sameOriginGuard(options.backofficeOrigin),
    config: {
      access: capabilityAccess("stock_expiries"),
      sessionSource: routeSessionSource({ db: options.db, now }),
    },
  };

  app.get("/expiring-lots", routeConfig, async (request, reply) => {
    const view = await readExpiringLots(
      { expiringLots, branchSettings, clock },
      { locationId: openSessionOf(request).locationId },
    );
    await reply.code(200).send(expiringLotListSchema.parse(view));
  });

  app.post("/expiring-lots/:lotId/discard", routeConfig, async (request, reply) => {
    const ids = await readRecordIds(reply, request.params, ["lotId"]);
    if (!ids) {
      return;
    }
    const openSession = openSessionOf(request);
    const outcome = await discardExpiredLot(
      { store, clock },
      { lotId: ids.lotId, locationId: openSession.locationId, actorId: openSession.userId },
    );

    switch (outcome.kind) {
      case "discarded":
        await reply.code(200).send(
          expiredLotDiscardResultSchema.parse({
            movementId: outcome.movementId,
            quantity: outcome.quantity,
            balance: outcome.balance,
            superseded: outcome.supersededByCountId !== null,
          }),
        );
        return;
      case "not_found":
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      case "not_expired":
        await reply.code(409).send(NOT_EXPIRED_RESPONSE);
        return;
      case "nothing_left":
        await reply.code(409).send(EMPTY_RESPONSE);
        return;
    }
  });
}
