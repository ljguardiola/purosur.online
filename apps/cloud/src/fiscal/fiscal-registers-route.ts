import { reportRegisterListSchema } from "@purosur/contracts";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { DrizzleBranchRegisterStore } from "../register/drizzle-branch-register-store.js";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";

export interface FiscalRegistersRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
}

export function registerFiscalRegistersRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: FiscalRegistersRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const branchRegisters = new DrizzleBranchRegisterStore(options.db, now);

  app.get(
    "/fiscal/registers",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("fiscal_information"), sessionSource },
    },
    async (request, reply) => {
      const registers = await branchRegisters.branchRegisters(openSessionOf(request).locationId);
      await reply.code(200).send(
        reportRegisterListSchema.parse({
          registers: registers.map(({ id, name }) => ({ id, name })),
        }),
      );
    },
  );
}
