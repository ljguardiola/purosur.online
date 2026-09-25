import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { alerts } from "../db/schema.js";
import { checkRequestIsSameOrigin, type OpenSession } from "../session/open-session.js";
import {
  OPEN_SESSION_ACCESS,
  openSessionOf,
  originGuard,
  registerRouteAccess,
  routeSessionSource,
} from "../session/route-access.js";
import { FORBIDDEN_RESPONSE } from "../users/forbidden-response.js";
import type { AlertAudience, AlertLevel } from "./alert-kind-catalog.js";
import { loadScopeDisplayNames, scopeDisplay } from "./alert-scope-display.js";
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
  scope: string;
  /** `scope` as a person reads it: a user's first name for a user-scoped kind, the raw scope otherwise. */
  scope_display: string;
  level: AlertLevel;
  audience: AlertAudience;
  opened_at: string;
  escalated_at: string | null;
  resolved_at: string | null;
}

export function toAlertSummaryWire(
  row: AlertSummaryRow,
  namesByUserId: ReadonlyMap<string, string>,
): AlertSummaryWire {
  return {
    id: row.id,
    kind: row.kind,
    scope: row.scope,
    scope_display: scopeDisplay(row.kind, row.scope, namesByUserId),
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

export interface AlertListFilters {
  level?: AlertLevel | undefined;
  open?: boolean | undefined;
}

/**
 * Lists every alert `session` can see (see `alert-visibility.ts`): a `view_all_alerts` holder (an
 * Administrator too) gets every alert; a `view_branch_alerts` holder gets only a Local one of
 * their own branch. Newest-opened first.
 */
export async function listVisibleAlerts<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  session: OpenSession,
  filters: AlertListFilters,
): Promise<AlertSummaryRow[]> {
  const conditions = [];
  if (!canSeeAllAlerts(session)) {
    conditions.push(and(eq(alerts.audience, "local"), eq(alerts.locationId, session.locationId)));
  }
  if (filters.level) {
    conditions.push(eq(alerts.level, filters.level));
  }
  if (filters.open === true) {
    conditions.push(isNull(alerts.resolvedAt));
  } else if (filters.open === false) {
    conditions.push(isNotNull(alerts.resolvedAt));
  }

  return db
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
    .where(and(...conditions))
    .orderBy(desc(alerts.openedAt));
}

/**
 * Registers `GET /alerts`: open to any signed-in user, then refused with 403 for one who holds
 * neither alert-view permission (an Administrator always holds both implicitly), the same
 * `FORBIDDEN_RESPONSE` a permission-gated route's own declared access answers with. Filters by
 * `level` and open/closed status (`open=true`/`open=false`) when given.
 */
export function registerAlertsListRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: AlertsRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get<{ Querystring: { level?: string; open?: string } }>(
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

      const level = isAlertLevel(request.query.level) ? request.query.level : undefined;
      const open =
        request.query.open === "true" ? true : request.query.open === "false" ? false : undefined;

      const rows = await listVisibleAlerts(options.db, openSession, { level, open });
      const namesByUserId = await loadScopeDisplayNames(
        options.db,
        rows.map((row) => row.scope),
      );
      await reply.code(200).send(rows.map((row) => toAlertSummaryWire(row, namesByUserId)));
    },
  );
}
