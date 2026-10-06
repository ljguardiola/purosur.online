import { type AlertKind, alertKindsWithScope, type VisibleAlertSight } from "@purosur/domain";
import type {
  AlertDelivery,
  AlertDetailView,
  AlertListFilters,
  AlertListPage,
  AlertReader,
  AlertSearch,
  AlertSummary,
  OpenAlertCounts,
  OpenAlertsOverview,
} from "@purosur/domain/alerts/use-cases";
import { and, asc, count, desc, eq, ilike, inArray, or, type SQL, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  alertDeliveries,
  alerts,
  registers,
  roles,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { closedAlertCondition, openAlertCondition } from "./open-alert-condition.js";

export const ALERTS_PAGE_SIZE = 25;

function sightCondition(sight: VisibleAlertSight): SQL | undefined {
  if (sight.kind === "all") {
    return undefined;
  }
  return and(eq(alerts.audience, "local"), eq(alerts.locationId, sight.locationId));
}

function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

const SUMMARY_COLUMNS = {
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
};

// Storage keeps the kind as free text, so a row can carry a kind the catalog no longer lists.
function asAlertKind(storedKind: string): AlertKind {
  return storedKind as AlertKind;
}

function toSummary(row: {
  id: string;
  kind: string;
  scope: string;
  level: AlertSummary["level"];
  audience: AlertSummary["audience"];
  locationId: string | null;
  openedAt: Date;
  escalateAt: Date | null;
  escalatedAt: Date | null;
  resolvedAt: Date | null;
}): AlertSummary {
  return { ...row, kind: asAlertKind(row.kind) };
}

export class DrizzleAlertReader<TQueryResult extends PgQueryResultHKT> implements AlertReader {
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async findVisibleAlert(
    sight: VisibleAlertSight,
    alertId: string,
  ): Promise<AlertDetailView | undefined> {
    const [row] = await this.db
      .select({ ...SUMMARY_COLUMNS, detail: alerts.detail, resolvedBy: alerts.resolvedBy })
      .from(alerts)
      .where(and(eq(alerts.id, alertId), sightCondition(sight)));
    return row && { ...toSummary(row), detail: row.detail, resolvedBy: row.resolvedBy };
  }

  async listVisibleAlerts(
    sight: VisibleAlertSight,
    filters: AlertListFilters,
    page: number,
  ): Promise<AlertListPage> {
    const conditions = [sightCondition(sight)];
    if (filters.level) {
      conditions.push(eq(alerts.level, filters.level));
    }
    if (filters.open === true) {
      conditions.push(openAlertCondition());
    } else if (filters.open === false) {
      conditions.push(closedAlertCondition());
    }
    if (filters.search) {
      conditions.push(this.searchCondition(filters.search));
    }
    const where = and(...conditions);

    const rows = await this.db
      .select(SUMMARY_COLUMNS)
      .from(alerts)
      .where(where)
      .orderBy(desc(alerts.openedAt), desc(alerts.id))
      .limit(ALERTS_PAGE_SIZE)
      .offset((page - 1) * ALERTS_PAGE_SIZE);
    const [matched] = await this.db.select({ total: count() }).from(alerts).where(where);
    return { alerts: rows.map(toSummary), total: matched?.total ?? 0 };
  }

  async countOpenVisibleAlerts(sight: VisibleAlertSight): Promise<OpenAlertCounts> {
    const [counts] = await this.db
      .select({
        openCount: count(),
        openCriticalCount: count(sql`case when ${alerts.level} = 'critical' then 1 end`),
      })
      .from(alerts)
      .where(and(sightCondition(sight), openAlertCondition()));
    return {
      openCount: counts?.openCount ?? 0,
      openCriticalCount: counts?.openCriticalCount ?? 0,
    };
  }

  async overviewOfOpenVisibleAlerts(sight: VisibleAlertSight): Promise<OpenAlertsOverview> {
    const rows = await this.db
      .select({ level: alerts.level, kind: alerts.kind, openCount: count() })
      .from(alerts)
      .where(and(sightCondition(sight), openAlertCondition()))
      .groupBy(alerts.level, alerts.kind)
      .orderBy(asc(alerts.kind));
    const overview: OpenAlertsOverview = {
      critical: { openCount: 0, kinds: [] },
      warning: { openCount: 0, kinds: [] },
      informational: { openCount: 0, kinds: [] },
    };
    for (const row of rows) {
      const level = overview[row.level];
      level.openCount += row.openCount;
      level.kinds.push(asAlertKind(row.kind));
    }
    return overview;
  }

  async deliveriesOf(alertId: string): Promise<AlertDelivery[]> {
    return this.db
      .select({
        channel: alertDeliveries.channel,
        status: alertDeliveries.status,
        error: alertDeliveries.error,
        createdAt: alertDeliveries.createdAt,
        recipientId: users.id,
        recipientFirstName: users.firstName,
        recipientRoleId: roles.id,
        recipientRoleName: roles.name,
        recipientRoleIsAdministrator: roles.isAdministrator,
      })
      .from(alertDeliveries)
      .innerJoin(users, eq(users.id, alertDeliveries.recipientUserId))
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(alertDeliveries.alertId, alertId))
      .orderBy(asc(alertDeliveries.createdAt), asc(alertDeliveries.id));
  }

  async displayNames(ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (ids.length === 0) {
      return new Map();
    }
    const userRows = await this.db
      .select({ id: users.id, name: users.firstName })
      .from(users)
      .where(inArray(sql`${users.id}::text`, [...ids]));
    const registerRows = await this.db
      .select({ id: registers.id, name: registers.name })
      .from(registers)
      .where(inArray(sql`${registers.id}::text`, [...ids]));
    return new Map([...userRows, ...registerRows].map((row) => [row.id, row.name]));
  }

  private searchCondition(search: AlertSearch): SQL | undefined {
    const pattern = containsPattern(search.text);
    const matchingUserIds = this.db
      .select({ id: sql<string>`${users.id}::text` })
      .from(users)
      .where(ilike(users.firstName, pattern));
    const matchingRegisterIds = this.db
      .select({ id: sql<string>`${registers.id}::text` })
      .from(registers)
      .where(ilike(registers.name, pattern));
    return or(
      search.kindsWithMatchingTitle.length > 0
        ? inArray(alerts.kind, [...search.kindsWithMatchingTitle])
        : undefined,
      and(
        inArray(alerts.kind, alertKindsWithScope("user")),
        inArray(alerts.scope, matchingUserIds),
      ),
      and(
        inArray(alerts.kind, alertKindsWithScope("register")),
        inArray(alerts.scope, matchingRegisterIds),
      ),
      and(
        inArray(alerts.kind, alertKindsWithScope("sourceAddress")),
        openAlertCondition(),
        ilike(alerts.scope, pattern),
      ),
    );
  }
}
