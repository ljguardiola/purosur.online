import { registerPointOfSaleOverviewListSchema } from "@purosur/contracts";
import type { BranchRegisterPointOfSale } from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../access/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { DrizzleRegisterPointOfSaleReader } from "./drizzle-register-point-of-sale-reader.js";

export interface RegistersPointsOfSaleRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
}

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
  options: RegistersPointsOfSaleRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzleRegisterPointOfSaleReader(options.db);

  app.get(
    "/registers/points-of-sale",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("cash_area"), sessionSource },
    },
    async (request, reply) => {
      const listed = await reader.listBranchRegisterPointsOfSale(openSessionOf(request).locationId);
      await reply
        .code(200)
        .send(registerPointOfSaleOverviewListSchema.parse(listed.map(toOverviewWire)));
    },
  );
}
