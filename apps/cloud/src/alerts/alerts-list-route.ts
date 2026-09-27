import {
  type AlertAudience,
  type AlertKind,
  type AlertLevel,
  isAlertKind,
} from "@purosur/contracts";
import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { FORBIDDEN_RESPONSE } from "../access/forbidden-response.js";
import { checkRequestIsSameOrigin, type OpenSession } from "../access/open-session.js";
import {
  OPEN_SESSION_ACCESS,
  openSessionOf,
  originGuard,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { alerts, users } from "../platform/db/schema.js";
import { ALERT_KIND_CATALOG, type AlertScopeKind } from "./alert-kind-catalog.js";
import { loadScopeDisplayNames, scopeDisplay, wireScope } from "./alert-scope-display.js";
import { canSeeAnyAlerts, visibleAlertsCondition } from "./alert-visibility.js";

export interface AlertsRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now?: () => Date;
}

export interface AlertSummaryRow {
  id: string;
  kind: string;
  scope: string;
  level: AlertLevel;
  audience: AlertAudience;
  locationId: string | null;
  openedAt: Date;
  escalateAt: Date | null;
  escalatedAt: Date | null;
  resolvedAt: Date | null;
}

export interface AlertSummaryWire {
  id: string;
  kind: string;
  scope: string | null;
  scope_display: string | null;
  level: AlertLevel;
  audience: AlertAudience;
  opened_at: string;
  escalated_at: string | null;
  resolved_at: string | null;
}

export interface AlertListWire {
  alerts: AlertSummaryWire[];
  total: number;
  page_size: number;
  open_count: number;
  open_critical_count: number;
}

export function toAlertSummaryWire(
  row: AlertSummaryRow,
  namesByUserId: ReadonlyMap<string, string>,
): AlertSummaryWire {
  return {
    id: row.id,
    kind: row.kind,
    scope: wireScope(row),
    scope_display: scopeDisplay(row, namesByUserId),
    level: row.level,
    audience: row.audience,
    opened_at: row.openedAt.toISOString(),
    escalated_at: row.escalatedAt?.toISOString() ?? null,
    resolved_at: row.resolvedAt?.toISOString() ?? null,
  };
}

const ALERT_LEVELS: readonly AlertLevel[] = ["informational", "warning", "critical"];

function isAlertLevel(value: unknown): value is AlertLevel {
  return typeof value === "string" && (ALERT_LEVELS as readonly string[]).includes(value);
}

export const ALERTS_PAGE_SIZE = 25;

export interface AlertListSearch {
  text: string;
  kindsWithMatchingTitle: readonly AlertKind[];
}

export interface AlertListFilters {
  level?: AlertLevel | undefined;
  open?: boolean | undefined;
  search?: AlertListSearch | undefined;
}

export interface AlertListPage {
  rows: AlertSummaryRow[];
  total: number;
}

export interface OpenAlertCounts {
  openCount: number;
  openCriticalCount: number;
}

function kindsWithScope(scopeKind: AlertScopeKind): AlertKind[] {
  return ALERT_KIND_CATALOG.filter((definition) => definition.scopeKind === scopeKind).map(
    (definition) => definition.kind,
  );
}

function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

function searchCondition<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  search: AlertListSearch,
): SQL | undefined {
  const pattern = containsPattern(search.text);
  const matchingUserIds = db
    .select({ id: sql<string>`${users.id}::text` })
    .from(users)
    .where(ilike(users.firstName, pattern));
  return or(
    search.kindsWithMatchingTitle.length > 0
      ? inArray(alerts.kind, [...search.kindsWithMatchingTitle])
      : undefined,
    and(inArray(alerts.kind, kindsWithScope("user")), inArray(alerts.scope, matchingUserIds)),
    and(
      inArray(alerts.kind, kindsWithScope("sourceAddress")),
      isNull(alerts.resolvedAt),
      ilike(alerts.scope, pattern),
    ),
  );
}

export async function listVisibleAlerts<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  session: OpenSession,
  filters: AlertListFilters,
  page: number,
): Promise<AlertListPage> {
  const conditions = [visibleAlertsCondition(session)];
  if (filters.level) {
    conditions.push(eq(alerts.level, filters.level));
  }
  if (filters.open === true) {
    conditions.push(isNull(alerts.resolvedAt));
  } else if (filters.open === false) {
    conditions.push(isNotNull(alerts.resolvedAt));
  }
  if (filters.search) {
    conditions.push(searchCondition(db, filters.search));
  }
  const where = and(...conditions);

  const rows = await db
    .select({
      id: alerts.id,
      kind: alerts.kind,
      scope: alerts.scope,
      level: alerts.level,
      audience: alerts.audience,
      locationId: alerts.locationId,
      openedAt: alerts.openedAt,
      escalateAt: alerts.escalateAt,
      escalatedAt: alerts.escalatedAt,
      resolvedAt: alerts.resolvedAt,
    })
    .from(alerts)
    .where(where)
    .orderBy(desc(alerts.openedAt), desc(alerts.id))
    .limit(ALERTS_PAGE_SIZE)
    .offset((page - 1) * ALERTS_PAGE_SIZE);
  const [matched] = await db.select({ total: count() }).from(alerts).where(where);
  return { rows, total: matched?.total ?? 0 };
}

export async function countOpenVisibleAlerts<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  session: OpenSession,
): Promise<OpenAlertCounts> {
  const [counts] = await db
    .select({
      openCount: count(),
      openCriticalCount: count(sql`case when ${alerts.level} = 'critical' then 1 end`),
    })
    .from(alerts)
    .where(and(visibleAlertsCondition(session), isNull(alerts.resolvedAt)));
  return { openCount: counts?.openCount ?? 0, openCriticalCount: counts?.openCriticalCount ?? 0 };
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
): AlertListSearch | undefined {
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
      preHandler: originGuard((request, reply) =>
        checkRequestIsSameOrigin(request, reply, options.backofficeOrigin),
      ),
      config: { access: OPEN_SESSION_ACCESS, sessionSource },
    },
    async (request, reply) => {
      const openSession = openSessionOf(request);
      if (!canSeeAnyAlerts(openSession)) {
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

      const { rows, total } = await listVisibleAlerts(
        options.db,
        openSession,
        { level, open, search },
        pageFromQuery(query.page),
      );
      const openCounts = await countOpenVisibleAlerts(options.db, openSession);
      const namesByUserId = await loadScopeDisplayNames(
        options.db,
        rows.map((row) => row.scope),
      );
      const body: AlertListWire = {
        alerts: rows.map((row) => toAlertSummaryWire(row, namesByUserId)),
        total,
        page_size: ALERTS_PAGE_SIZE,
        open_count: openCounts.openCount,
        open_critical_count: openCounts.openCriticalCount,
      };
      await reply.code(200).send(body);
    },
  );
}
