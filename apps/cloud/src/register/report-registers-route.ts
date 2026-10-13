import { reportRegisterListSchema } from "@purosur/contracts";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleBranchRegisterStore } from "./drizzle-branch-register-store.js";

export interface ReportRegistersRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
}

export function registerReportRegistersRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: ReportRegistersRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const branchRegisters = new DrizzleBranchRegisterStore(options.db, now);

  app.get(
    "/reports/registers",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("reports_area"), sessionSource },
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
