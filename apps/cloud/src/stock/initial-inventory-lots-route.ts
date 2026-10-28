import {
  initialInventoryLotListSchema,
  initialInventoryLotsQuerySchema,
  lotReferenceCostBodySchema,
} from "@purosur/contracts";
import { readInitialCountLots, setLotReferenceCost } from "@purosur/domain/stock/use-cases";
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
import { DrizzleInitialCountLotReader } from "./drizzle-initial-count-lot-reader.js";
import { DrizzleLotCostStore } from "./drizzle-lot-cost-store.js";
import type { StockRouteOptions } from "./stock-route-options.js";

const NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no lot of the initial count with that id",
} as const;
const WITHDRAWN_RESPONSE = {
  code: "lot_withdrawn",
  message: "the lot was withdrawn from the initial count",
} as const;
const NOT_AN_INITIAL_COUNT_LOT_RESPONSE = {
  code: "not_an_initial_count_lot",
  message: "only a lot of the initial count takes a reference cost",
} as const;

const COST_CHOSEN_FROM_SUPPLIER_PRICES_RESPONSE = {
  code: "cost_chosen_from_supplier_prices",
  message: "the product has loaded supplier prices, so its cost is chosen among them",
} as const;
const SUPPLIER_PRICE_NOT_FOUND_RESPONSE = {
  code: "supplier_price_not_found",
  message: "the supplier item has no loaded price for the lot's product",
} as const;

export function registerInitialInventoryLotsRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: StockRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  const initialCountLots = new DrizzleInitialCountLotReader(options.db);
  const store = new DrizzleLotCostStore(options.db);
  registerRouteAccess(app);
  const routeConfig = {
    preHandler: sameOriginGuard(options.backofficeOrigin),
    config: {
      access: capabilityAccess("initial_inventory"),
      sessionSource: routeSessionSource({ db: options.db, now }),
    },
  };

  app.get("/initial-inventory-lots", routeConfig, async (request, reply) => {
    const query = await readValidatedBody(reply, initialInventoryLotsQuerySchema, request.query);
    if (!query) {
      return;
    }
    const lots = await readInitialCountLots(
      { initialCountLots },
      {
        locationId: openSessionOf(request).locationId,
        ...(query.cost === undefined ? {} : { cost: query.cost }),
        ...(query.product === undefined ? {} : { productName: query.product }),
      },
    );
    await reply.code(200).send(initialInventoryLotListSchema.parse({ lots }));
  });

  app.put("/initial-inventory-lots/:lotId/reference-cost", routeConfig, async (request, reply) => {
    const ids = await readRecordIds(reply, request.params, ["lotId"]);
    if (!ids) {
      return;
    }
    const body = await readValidatedBody(reply, lotReferenceCostBodySchema, request.body);
    if (!body) {
      return;
    }

    const outcome = await setLotReferenceCost(
      { store },
      {
        locationId: openSessionOf(request).locationId,
        lotId: ids.lotId,
        choice:
          "unitCostCents" in body
            ? { kind: "typed", unitCostCents: body.unitCostCents }
            : { kind: "supplier_price", supplierItemId: body.supplierItemId },
      },
    );

    switch (outcome.kind) {
      case "set":
        await reply.code(204).send();
        return;
      case "invalid_cost":
        await reply.code(400).send({
          code: "validation_failed",
          message: "unitCostCents must be a positive whole number of cents",
          details: [{ field: "unitCostCents" }],
        });
        return;
      case "not_found":
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      case "lot_withdrawn":
        await reply.code(404).send(WITHDRAWN_RESPONSE);
        return;
      case "not_an_initial_count_lot":
        await reply.code(409).send(NOT_AN_INITIAL_COUNT_LOT_RESPONSE);
        return;
      case "cost_chosen_from_supplier_prices":
        await reply.code(409).send(COST_CHOSEN_FROM_SUPPLIER_PRICES_RESPONSE);
        return;
      case "supplier_price_not_found":
        await reply.code(409).send(SUPPLIER_PRICE_NOT_FOUND_RESPONSE);
        return;
    }
  });
}
