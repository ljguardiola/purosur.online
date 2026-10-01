import { branchSettingsSchema } from "@purosur/contracts";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../access/backoffice-origin.js";
import {
  openSessionOf,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { toBranchSettingsWire } from "./branch-settings-wire.js";
import { DrizzleBranchSettingsReader } from "./drizzle-branch-settings-reader.js";

export interface BranchSettingsRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now?: () => Date;
}

export function registerBranchSettingsReadRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: BranchSettingsRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzleBranchSettingsReader(options.db);

  app.get(
    "/locations/current/settings",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: permissionAccess("configure_branch"), sessionSource },
    },
    async (request, reply) => {
      const settings = await reader.currentBranchSettings(openSessionOf(request).locationId);
      await reply.code(200).send(branchSettingsSchema.parse(toBranchSettingsWire(settings)));
    },
  );
}
