import { registerSyncStatusListSchema } from "@purosur/contracts";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../access/backoffice-origin.js";
import {
  OPEN_SESSION_ACCESS,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { DrizzleBranchRegisterSyncReader } from "./drizzle-branch-register-sync-reader.js";

export interface RegisterSyncStatusRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
}

export function registerRegisterSyncStatusRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RegisterSyncStatusRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzleBranchRegisterSyncReader(options.db);

  app.get(
    "/registers/sync-status",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: OPEN_SESSION_ACCESS, sessionSource },
    },
    async (request, reply) => {
      const { locationId } = openSessionOf(request);
      const registers = await reader.lastSuccessfulSyncOfBranchRegisters(locationId);
      await reply.code(200).send(
        registerSyncStatusListSchema.parse(
          registers.map((register) => ({
            id: register.id,
            name: register.name,
            last_successful_sync_at: register.lastSuccessfulSyncAt?.toISOString() ?? null,
          })),
        ),
      );
    },
  );
}
