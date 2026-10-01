import { registerPointOfSaleOverviewListSchema } from "@purosur/contracts";
import type { BranchRegisterPointOfSale } from "@purosur/domain/register/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../access/backoffice-origin.js";
import {
  openSessionOf,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { DrizzleBranchRegisterStore } from "./drizzle-branch-register-store.js";
import type { RegistersRouteOptions } from "./registers-list-route.js";

function toOverviewWire(setup: BranchRegisterPointOfSale) {
  return {
    register_id: setup.registerId,
    register_name: setup.registerName,
    point_of_sale_number: setup.pointOfSaleNumber,
    fiscal_address_id: setup.fiscalAddressId,
    version: setup.version,
  };
}

export function registerRegistersPointsOfSaleListRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RegistersRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const pointsOfSale = new DrizzleBranchRegisterStore(options.db);

  app.get(
    "/registers/points-of-sale",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: permissionAccess("change_fiscal_configuration"), sessionSource },
    },
    async (request, reply) => {
      const listed = await pointsOfSale.branchRegisterPointsOfSale(
        openSessionOf(request).locationId,
      );
      await reply
        .code(200)
        .send(registerPointOfSaleOverviewListSchema.parse(listed.map(toOverviewWire)));
    },
  );
}
