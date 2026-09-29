import { type AlertsOverview, alertsOverviewSchema } from "@purosur/contracts";
import { and, asc, count, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../access/backoffice-origin.js";
import { FORBIDDEN_RESPONSE } from "../access/forbidden-response.js";
import type { OpenSession } from "../access/open-session.js";
import {
  OPEN_SESSION_ACCESS,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { alerts } from "../platform/db/schema.js";
import { canSeeAnyAlerts, visibleAlertsCondition } from "./alert-visibility.js";
import type { AlertsRouteOptions } from "./alerts-list-route.js";

async function overviewOfOpenVisibleAlerts<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  session: OpenSession,
): Promise<AlertsOverview> {
  const rows = await db
    .select({ level: alerts.level, kind: alerts.kind, openCount: count() })
    .from(alerts)
    .where(and(visibleAlertsCondition(session), isNull(alerts.resolvedAt)))
    .groupBy(alerts.level, alerts.kind)
    .orderBy(asc(alerts.kind));
  const overview: AlertsOverview = {
    critical: { openCount: 0, kinds: [] },
    warning: { openCount: 0, kinds: [] },
    informational: { openCount: 0, kinds: [] },
  };
  for (const row of rows) {
    const level = overview[row.level];
    level.openCount += row.openCount;
    level.kinds.push(row.kind);
  }
  return overview;
}

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
      if (!canSeeAnyAlerts(openSession)) {
        await reply.code(403).send(FORBIDDEN_RESPONSE);
        return;
      }
      const body = alertsOverviewSchema.parse(
        await overviewOfOpenVisibleAlerts(options.db, openSession),
      );
      await reply.code(200).send(body);
    },
  );
}
