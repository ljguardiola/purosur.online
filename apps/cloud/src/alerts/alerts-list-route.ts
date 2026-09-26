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
import { alerts, users } from "../db/schema.js";
import { checkRequestIsSameOrigin, type OpenSession } from "../session/open-session.js";
import {
  OPEN_SESSION_ACCESS,
  openSessionOf,
  originGuard,
  registerRouteAccess,
  routeSessionSource,
} from "../session/route-access.js";
import { FORBIDDEN_RESPONSE } from "../users/forbidden-response.js";
import {
  ALERT_KIND_CATALOG,
  type AlertAudience,
  type AlertKind,
  type AlertLevel,
  type AlertScopeKind,
  isAlertKind,
} from "./alert-kind-catalog.js";
import { loadScopeDisplayNames, scopeDisplay, wireScope } from "./alert-scope-display.js";
import { canSeeAllAlerts, canSeeAnyAlerts } from "./alert-visibility.js";

export interface AlertsRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  /** Injected in tests so idle/absolute expiry and escalation are checked against a deterministic clock. */
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
  /** `null` for a closed source-address-scoped kind, whose stored scope is only a hash. */
  scope: string | null;
  /** `scope` as a person reads it (see `scopeDisplay`); `null` for a closed source-address-scoped kind. */
  scope_display: string | null;
  level: AlertLevel;
  audience: AlertAudience;
  opened_at: string;
  escalated_at: string | null;
  resolved_at: string | null;
}

export interface AlertListWire {
  alerts: AlertSummaryWire[];
  /** How many alerts matched the filters, across every page. */
  total: number;
  page_size: number;
  /** Every open alert the viewer can see, regardless of the filters or the page. */
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
  /**
   * The kinds whose own title matched `text`: those titles live in the backoffice's message
   * catalog, never here, so the backoffice sends the kinds that matched.
   */
  kinds: readonly AlertKind[];
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

function visibilityCondition(session: OpenSession): SQL | undefined {
  return canSeeAllAlerts(session)
    ? undefined
    : and(eq(alerts.audience, "local"), eq(alerts.locationId, session.locationId));
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
    search.kinds.length > 0 ? inArray(alerts.kind, [...search.kinds]) : undefined,
    and(inArray(alerts.kind, kindsWithScope("user")), inArray(alerts.scope, matchingUserIds)),
    // A closed source-address-scoped alert no longer holds the address (see alert-close-route.ts).
    and(
      inArray(alerts.kind, kindsWithScope("sourceAddress")),
      isNull(alerts.resolvedAt),
      ilike(alerts.scope, pattern),
    ),
  );
}

/**
 * Lists one page of the alerts `session` can see (see `alert-visibility.ts`): a `view_all_alerts`
 * holder (an Administrator too) gets every alert; a `view_branch_alerts` holder gets only a Local
 * one of their own branch. Newest-opened first; `page` is 1-based.
 */
export async function listVisibleAlerts<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  session: OpenSession,
  filters: AlertListFilters,
  page: number,
): Promise<AlertListPage> {
  const conditions = [visibilityCondition(session)];
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

/** Counts every open alert `session` can see and how many of them are Critical, ignoring any filter. */
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
    .where(and(visibilityCondition(session), isNull(alerts.resolvedAt)));
  return { openCount: counts?.openCount ?? 0, openCriticalCount: counts?.openCriticalCount ?? 0 };
}

type AlertsQuery = { level?: string; open?: string; page?: string; q?: string; kinds?: string };

// A repeated key (`?q=a&q=b`) reaches the handler as an array rather than a string.
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
  return { text: trimmed, kinds: (kinds ?? "").split(",").filter(isAlertKind) };
}

/**
 * Registers `GET /alerts`: open to any signed-in user, then refused with 403 for one who holds
 * neither alert-view permission (an Administrator always holds both implicitly), the same
 * `FORBIDDEN_RESPONSE` a permission-gated route's own declared access answers with. Filters by
 * `level`, open/closed status (`open=true`/`open=false`) and search text (`q`, with the kinds
 * whose title matched it in `kinds`, comma-separated) when given, and answers one `page` of them
 * plus the open-alert counts the screen's header and footer show.
 */
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
