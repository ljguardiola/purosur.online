import { branchSettingsReadSchema } from "@purosur/contracts";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { DrizzlePublishedZoneRulesReader } from "../register/drizzle-zone-rules-store.js";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { toEditableBranchSettingsWire } from "./branch-settings-wire.js";
import { DrizzleBranchSettingsReader } from "./drizzle-branch-settings-reader.js";

export interface BranchSettingsRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
}

export function registerBranchSettingsReadRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: BranchSettingsRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzleBranchSettingsReader(options.db);
  const zoneRules = new DrizzlePublishedZoneRulesReader(options.db);

  app.get(
    "/locations/current/settings",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("branch_area"), sessionSource },
    },
    async (request, reply) => {
      const settings = await reader.currentBranchSettings(openSessionOf(request).locationId);
      const zoneRulesVersion = await zoneRules.currentZoneRulesVersion();
      await reply.code(200).send(
        branchSettingsReadSchema.parse({
          ...toEditableBranchSettingsWire(settings),
          zone_rules_version: zoneRulesVersion,
        }),
      );
    },
  );
}
