import type { AlertAudience, AlertLevel } from "@purosur/contracts";
import { and, asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { FORBIDDEN_RESPONSE } from "../access/forbidden-response.js";
import { checkRequestIsSameOrigin } from "../access/open-session.js";
import {
  OPEN_SESSION_ACCESS,
  openSessionOf,
  originGuard,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { alertDeliveries, alerts, roles, userRoles, users } from "../platform/db/schema.js";
import {
  holdsOnlySourceAddressHash,
  loadScopeDisplayNames,
  scopeDisplay,
  wireScope,
} from "./alert-scope-display.js";
import {
  type AlertViewerAccess,
  canSeeAnyAlerts,
  visibleAlertsCondition,
} from "./alert-visibility.js";
import type { AlertsRouteOptions } from "./alerts-list-route.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ALERT_NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no alert with that id",
} as const;

export interface AlertDetailRow {
  id: string;
  kind: string;
  scope: string;
  level: AlertLevel;
  audience: AlertAudience;
  locationId: string | null;
  detail: Record<string, unknown>;
  openedAt: Date;
  escalateAt: Date | null;
  escalatedAt: Date | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
}

export interface AlertDeliveryRow {
  id: string;
  channel: string;
  status: string;
  error: string | null;
  createdAt: Date;
  recipientId: string;
  recipientFirstName: string;
  recipientRoleId: string;
  recipientRoleName: string | null;
  recipientRoleIsAdministrator: boolean;
}

export interface AlertDeliveryWire {
  channel: string;
  status: string;
  error: string | null;
  created_at: string;
  recipient: {
    id: string;
    first_name: string;
    role: { id: string; name: string | null; is_administrator: boolean };
  };
}

export interface AlertDetailWire {
  id: string;
  kind: string;
  scope: string | null;
  scope_display: string | null;
  level: AlertLevel;
  audience: AlertAudience;
  detail: Record<string, unknown>;
  opened_at: string;
  escalated_at: string | null;
  resolved_at: string | null;
  deliveries: AlertDeliveryWire[];
}

export function detailWithActorName(
  detail: Record<string, unknown>,
  namesByUserId: ReadonlyMap<string, string>,
): Record<string, unknown> {
  const actorId = detail["actorId"];
  if (typeof actorId !== "string") {
    return detail;
  }
  const actorName = namesByUserId.get(actorId);
  return actorName === undefined ? detail : { ...detail, actorName };
}

export function toAlertDeliveryWire(row: AlertDeliveryRow): AlertDeliveryWire {
  return {
    channel: row.channel,
    status: row.status,
    error: row.error,
    created_at: row.createdAt.toISOString(),
    recipient: {
      id: row.recipientId,
      first_name: row.recipientFirstName,
      role: {
        id: row.recipientRoleId,
        name: row.recipientRoleName,
        is_administrator: row.recipientRoleIsAdministrator,
      },
    },
  };
}

function detailWithoutSourceAddressHash(alert: AlertDetailRow): Record<string, unknown> {
  if (!holdsOnlySourceAddressHash(alert)) {
    return alert.detail;
  }
  const { sourceAddress: _hash, ...rest } = alert.detail;
  return rest;
}

export function toAlertDetailWire(
  alert: AlertDetailRow,
  deliveries: AlertDeliveryRow[],
  namesByUserId: ReadonlyMap<string, string>,
): AlertDetailWire {
  return {
    id: alert.id,
    kind: alert.kind,
    scope: wireScope(alert),
    scope_display: scopeDisplay(alert, namesByUserId),
    level: alert.level,
    audience: alert.audience,
    detail: detailWithActorName(detailWithoutSourceAddressHash(alert), namesByUserId),
    opened_at: alert.openedAt.toISOString(),
    escalated_at: alert.escalatedAt?.toISOString() ?? null,
    resolved_at: alert.resolvedAt?.toISOString() ?? null,
    deliveries: deliveries.map(toAlertDeliveryWire),
  };
}

export async function findAlertById<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  id: string,
  access: AlertViewerAccess,
): Promise<AlertDetailRow | undefined> {
  if (!UUID_PATTERN.test(id)) {
    return undefined;
  }
  const [row] = await db
    .select({
      id: alerts.id,
      kind: alerts.kind,
      scope: alerts.scope,
      level: alerts.level,
      audience: alerts.audience,
      locationId: alerts.locationId,
      detail: alerts.detail,
      openedAt: alerts.openedAt,
      escalateAt: alerts.escalateAt,
      escalatedAt: alerts.escalatedAt,
      resolvedAt: alerts.resolvedAt,
      resolvedBy: alerts.resolvedBy,
    })
    .from(alerts)
    .where(and(eq(alerts.id, id), visibleAlertsCondition(access)));
  return row;
}

export async function listAlertDeliveries<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  alertId: string,
): Promise<AlertDeliveryRow[]> {
  return db
    .select({
      id: alertDeliveries.id,
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

export function registerAlertReadRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: AlertsRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get<{ Params: { id: string } }>(
    "/alerts/:id",
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

      const alert = await findAlertById(options.db, request.params.id, openSession);
      if (!alert) {
        await reply.code(404).send(ALERT_NOT_FOUND_RESPONSE);
        return;
      }

      const deliveries = await listAlertDeliveries(options.db, alert.id);
      const namesByUserId = await loadScopeDisplayNames(options.db, userIdsToResolve(alert));
      await reply.code(200).send(toAlertDetailWire(alert, deliveries, namesByUserId));
    },
  );
}

export function userIdsToResolve(alert: Pick<AlertDetailRow, "scope" | "detail">): string[] {
  const actorId = alert.detail["actorId"];
  return typeof actorId === "string" ? [alert.scope, actorId] : [alert.scope];
}
