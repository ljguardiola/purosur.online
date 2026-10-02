import { type AlertSummary, alertListPageSchema } from "@purosur/contracts";
import { alertNamedRecordIds, isAlertKind, isAlertLevel } from "@purosur/domain";
import type {
  AlertSearch,
  AlertSummary as AlertSummaryRow,
} from "@purosur/domain/alerts/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
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
import { scopeDisplay, wireScope } from "./alert-scope-wire.js";
import { ALERTS_PAGE_SIZE, DrizzleAlertReader } from "./drizzle-alert-reader.js";

export interface AlertsRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now?: () => Date;
}

function toAlertSummary(
  row: AlertSummaryRow,
  namesById: ReadonlyMap<string, string>,
): AlertSummary {
  return {
    id: row.id,
    kind: row.kind,
    scope: wireScope(row),
    scopeDisplay: scopeDisplay(row, namesById),
    level: row.level,
    audience: row.audience,
    openedAt: row.openedAt.toISOString(),
    escalatedAt: row.escalatedAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

type AlertsQuery = { level?: string; open?: string; page?: string; q?: string; kinds?: string };

// Fastify hands a repeated key (`?q=a&q=b`) to the handler as an array rather than a string.
function isSingleValuedQuery(query: Record<string, unknown>): query is AlertsQuery {
  return Object.values(query).every((value) => typeof value === "string");
}

function pageFromQuery(value: string | undefined): number {
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

function searchFromQuery(
  text: string | undefined,
  kinds: string | undefined,
): AlertSearch | undefined {
  const trimmed = text?.trim() ?? "";
  if (trimmed === "") {
    return undefined;
  }
  return { text: trimmed, kindsWithMatchingTitle: (kinds ?? "").split(",").filter(isAlertKind) };
}

export function registerAlertsListRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: AlertsRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get<{ Querystring: Record<string, unknown> }>(
    "/alerts",
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

      const { query } = request;
      if (!isSingleValuedQuery(query)) {
        await reply.code(400).send({
          code: "validation_failed",
          message: "each query parameter may be given only once",
        });
        return;
      }
      const level = isAlertLevel(query.level) ? query.level : undefined;
      const open = query.open === "true" ? true : query.open === "false" ? false : undefined;
      const search = searchFromQuery(query.q, query.kinds);

      const reader = new DrizzleAlertReader(options.db);
      const { alerts, total } = await reader.listVisibleAlerts(
        sight,
        { level, open, search },
        pageFromQuery(query.page),
      );
      const openCounts = await reader.countOpenVisibleAlerts(sight);
      const namesById = await reader.displayNames(alerts.flatMap(alertNamedRecordIds));
      const body = alertListPageSchema.parse({
        alerts: alerts.map((alert) => toAlertSummary(alert, namesById)),
        total,
        pageSize: ALERTS_PAGE_SIZE,
        openCount: openCounts.openCount,
        openCriticalCount: openCounts.openCriticalCount,
      });
      await reply.code(200).send(body);
    },
  );
}
