import { currentOfflineAuthorizationCodeSchema } from "@purosur/contracts";
import type { ZoneRulesSource } from "@purosur/domain";
import { readCurrentOfflineAuthorizationCode } from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleHeldOfflineAuthorizationCodeReader } from "./drizzle-held-offline-authorization-code-reader.js";

export interface CurrentOfflineAuthorizationCodeRouteOptions<
  TQueryResult extends PgQueryResultHKT,
> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
  zoneRules: ZoneRulesSource;
}

export function registerCurrentOfflineAuthorizationCodeRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: CurrentOfflineAuthorizationCodeRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const codes = new DrizzleHeldOfflineAuthorizationCodeReader(options.db);

  app.get(
    "/fiscal/current-offline-authorization-code",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("fiscal_information"), sessionSource },
    },
    async (_request, reply) => {
      const held = await readCurrentOfflineAuthorizationCode({
        codes,
        clock: { now },
        zoneRules: options.zoneRules,
      });
      await reply.code(200).send(
        currentOfflineAuthorizationCodeSchema.parse({
          offline_authorization_code: held && {
            code: held.code,
            fortnight_start: held.fortnight.start,
            fortnight_end: held.fortnight.end,
            report_deadline: held.reportDeadline,
          },
        }),
      );
    },
  );
}
