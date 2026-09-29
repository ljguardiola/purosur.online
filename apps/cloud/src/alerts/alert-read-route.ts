import { type AlertDetail, alertDetailSchema } from "@purosur/contracts";
import type { AlertAudience, AlertLevel } from "@purosur/domain";
import { and, asc, eq } from "drizzle-orm";
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

function detailWithActorName(
  detail: Record<string, unknown>,
  namesById: ReadonlyMap<string, string>,
): Record<string, unknown> {
  const actorId = detail["actorId"];
  if (typeof actorId !== "string") {
    return detail;
  }
  const actorName = namesById.get(actorId);
  return actorName === undefined ? detail : { ...detail, actorName };
}

function toAlertDelivery(row: AlertDeliveryRow): AlertDetail["deliveries"][number] {
  return {
    channel: row.channel,
    status: row.status,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    recipient: {
      id: row.recipientId,
      firstName: row.recipientFirstName,
      role: {
        id: row.recipientRoleId,
        name: row.recipientRoleName,
        isAdministrator: row.recipientRoleIsAdministrator,
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

export function toAlertDetailBody(
  alert: AlertDetailRow,
  deliveries: AlertDeliveryRow[],
  namesById: ReadonlyMap<string, string>,
): AlertDetail {
  return alertDetailSchema.parse({
    id: alert.id,
    kind: alert.kind,
    scope: wireScope(alert),
    scopeDisplay: scopeDisplay(alert, namesById),
    level: alert.level,
    audience: alert.audience,
    detail: detailWithActorName(detailWithoutSourceAddressHash(alert), namesById),
    openedAt: alert.openedAt.toISOString(),
    escalatedAt: alert.escalatedAt?.toISOString() ?? null,
    resolvedAt: alert.resolvedAt?.toISOString() ?? null,
    deliveries: deliveries.map(toAlertDelivery),
  });
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
      preHandler: sameOriginGuard(options.backofficeOrigin),
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
      const namesById = await loadScopeDisplayNames(options.db, idsToResolve(alert));
      await reply.code(200).send(toAlertDetailBody(alert, deliveries, namesById));
    },
  );
}

export function idsToResolve(alert: Pick<AlertDetailRow, "scope" | "detail">): string[] {
  const actorId = alert.detail["actorId"];
  return typeof actorId === "string" ? [alert.scope, actorId] : [alert.scope];
}
