import { branchOfflinePointOfSaleListSchema } from "@purosur/contracts";
import type { BranchOfflinePointOfSale } from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleBranchOfflinePointOfSaleReader } from "./drizzle-branch-offline-point-of-sale-reader.js";

export interface BranchOfflinePointsOfSaleRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
}

function toWire(offline: BranchOfflinePointOfSale) {
  return {
    point_of_sale_number: offline.pointOfSaleNumber,
    register_id: offline.registerId,
    register_name: offline.registerName,
    assigned: offline.assigned,
    retired_at: offline.retiredAt?.toISOString() ?? null,
  };
}

export function registerBranchOfflinePointsOfSaleListRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: BranchOfflinePointsOfSaleRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzleBranchOfflinePointOfSaleReader(options.db);

  app.get(
    "/registers/offline-points-of-sale",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("cash_area"), sessionSource },
    },
    async (request, reply) => {
      const listed = await reader.listBranchOfflinePointsOfSale(openSessionOf(request).locationId);
      await reply.code(200).send(branchOfflinePointOfSaleListSchema.parse(listed.map(toWire)));
    },
  );
}
