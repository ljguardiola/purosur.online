import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { alertDeliveries, alerts, roles, userRoles, users } from "../db/schema.js";
import { checkRequestIsSameOrigin } from "../session/open-session.js";
import {
  OPEN_SESSION_ACCESS,
  openSessionOf,
  originGuard,
  registerRouteAccess,
  routeSessionSource,
} from "../session/route-access.js";
import { FORBIDDEN_RESPONSE } from "../users/forbidden-response.js";
import type { AlertAudience, AlertLevel } from "./alert-kind-catalog.js";
import { canSeeAlert, canSeeAnyAlerts } from "./alert-visibility.js";
import type { AlertsRouteOptions } from "./alerts-list-route.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A malformed id, a missing one, and one the viewer cannot see all answer alike, the same "none of
// the three ever leaks which one it was" reasoning `role-read-route.ts` applies to a role id.
// Reused by `alert-close-route.ts` for the same lookup.
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
  scope: string;
  level: AlertLevel;
  audience: AlertAudience;
  detail: Record<string, unknown>;
  opened_at: string;
  escalated_at: string | null;
  resolved_at: string | null;
  deliveries: AlertDeliveryWire[];
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

export function toAlertDetailWire(
  alert: AlertDetailRow,
  deliveries: AlertDeliveryRow[],
): AlertDetailWire {
  return {
    id: alert.id,
    kind: alert.kind,
    scope: alert.scope,
    level: alert.level,
    audience: alert.audience,
    detail: alert.detail,
    opened_at: alert.openedAt.toISOString(),
    escalated_at: alert.escalatedAt?.toISOString() ?? null,
    resolved_at: alert.resolvedAt?.toISOString() ?? null,
    deliveries: deliveries.map(toAlertDeliveryWire),
  };
}

/** Looks up one alert by id, answering `undefined` for a malformed or missing one alike. */
export async function findAlertById<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  id: string,
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
    .where(eq(alerts.id, id));
  return row;
}

/** Every delivery of `alertId`, with the recipient's name and role, ordered by when it was written. */
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
    .where(eq(alertDeliveries.alertId, alertId));
}

/**
 * Registers `GET /alerts/:id`: open to any signed-in user, refused with 403 for one who holds
 * neither alert-view permission, and 404 for a malformed id, a missing one, or one the viewer's
 * own audience visibility (`alert-visibility.ts`) does not extend to — the same alike-answer shape
 * `not_found` gives everywhere else in this codebase, so none of the three ever leaks which one it
 * was.
 */
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

      const alert = await findAlertById(options.db, request.params.id);
      if (!alert || !canSeeAlert(openSession, alert)) {
        await reply.code(404).send(ALERT_NOT_FOUND_RESPONSE);
        return;
      }

      const deliveries = await listAlertDeliveries(options.db, alert.id);
      await reply.code(200).send(toAlertDetailWire(alert, deliveries));
    },
  );
}
