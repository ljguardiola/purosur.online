import { alertsOverviewSchema } from "@purosur/contracts";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../access/backoffice-origin.js";
import { FORBIDDEN_RESPONSE } from "../access/forbidden-response.js";
import {
  OPEN_SESSION_ACCESS,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { visibleSightOf } from "./alert-route-sight.js";
import type { AlertsRouteOptions } from "./alerts-list-route.js";
import { DrizzleAlertReader } from "./drizzle-alert-reader.js";

export function registerAlertsOverviewRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: AlertsRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get(
    "/alerts/overview",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: OPEN_SESSION_ACCESS, sessionSource },
    },
    async (request, reply) => {
      const openSession = openSessionOf(request);
      const sight = visibleSightOf(openSession);
      if (!sight) {
        await reply.code(403).send(FORBIDDEN_RESPONSE);
        return;
      }
      const body = alertsOverviewSchema.parse(
        await new DrizzleAlertReader(options.db).overviewOfOpenVisibleAlerts(sight),
      );
      await reply.code(200).send(body);
    },
  );
}
