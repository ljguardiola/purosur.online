import { type AlertDetail, alertDetailSchema } from "@purosur/contracts";
import {
  alertActorId,
  alertClosing,
  alertKindPolicy,
  alertNamedRecordIds,
  argentinaCalendarDay,
  DISCARDABLE_REFUND_ALERT_KINDS,
  hasFortnightStarted,
  isAlertKind,
  isAlertOfViewerBranch,
  isOpenAlert,
} from "@purosur/domain";
import type { AlertDelivery, AlertDetailView } from "@purosur/domain/alerts/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readRecordIds } from "../platform/record-id-params.js";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import { FORBIDDEN_RESPONSE } from "../sessions/forbidden-response.js";
import {
  OPEN_SESSION_ACCESS,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { visibleSightOf } from "./alert-route-sight.js";
import { holdsOnlySourceAddressHash, scopeDisplay, wireScope } from "./alert-scope-wire.js";
import type { AlertsRouteOptions } from "./alerts-list-route.js";
import { DrizzleAlertReader } from "./drizzle-alert-reader.js";

export const ALERT_NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no alert with that id",
} as const;

function detailWithActorName(
  detail: Record<string, unknown>,
  namesById: ReadonlyMap<string, string>,
): Record<string, unknown> {
  const actorId = alertActorId(detail);
  const actorName = actorId === undefined ? undefined : namesById.get(actorId);
  return actorName === undefined ? detail : { ...detail, actorName };
}

function detailWithRegisterName(
  alert: Pick<AlertDetailView, "kind">,
  detail: Record<string, unknown>,
  namesById: ReadonlyMap<string, string>,
): Record<string, unknown> {
  const { registerId } = detail;
  const registerName = typeof registerId === "string" ? namesById.get(registerId) : undefined;
  return isAlertKind(alert.kind) &&
    alertKindPolicy(alert.kind).scopeKind === "pointOfSaleFortnight" &&
    registerName !== undefined
    ? { ...detail, registerName }
    : detail;
}

function detailWithFortnightStarted(
  alert: Pick<AlertDetailView, "kind" | "detail">,
  detail: Record<string, unknown>,
  today: string,
): Record<string, unknown> {
  const { fortnightStart, fortnightEnd } = alert.detail;
  if (
    alert.kind !== "offline_authorization_code_missing" ||
    typeof fortnightStart !== "string" ||
    typeof fortnightEnd !== "string"
  ) {
    return detail;
  }
  return {
    ...detail,
    fortnightStarted: hasFortnightStarted({ start: fortnightStart, end: fortnightEnd }, today),
  };
}

function detailWithViewerBranch(
  alert: Pick<AlertDetailView, "kind" | "locationId">,
  detail: Record<string, unknown>,
  viewer: { locationId: string },
): Record<string, unknown> {
  return alert.kind === "lots_expiring"
    ? { ...detail, aboutViewerBranch: isAlertOfViewerBranch(viewer, alert) }
    : detail;
}

function toAlertDelivery(row: AlertDelivery): AlertDetail["deliveries"][number] {
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

function detailWithoutSourceAddressHash(alert: AlertDetailView): Record<string, unknown> {
  if (!holdsOnlySourceAddressHash(alert)) {
    return alert.detail;
  }
  const { sourceAddress: _hash, ...rest } = alert.detail;
  return rest;
}

export function toAlertDetailBody(
  alert: AlertDetailView,
  deliveries: AlertDelivery[],
  namesById: ReadonlyMap<string, string>,
  now: Date,
  viewer: { locationId: string },
): AlertDetail {
  return alertDetailSchema.parse({
    id: alert.id,
    kind: alert.kind,
    scope: wireScope(alert),
    scopeDisplay: scopeDisplay(alert, namesById),
    scopeKind: alertKindPolicy(alert.kind).scopeKind,
    level: alert.level,
    audience: alert.audience,
    detail: detailWithViewerBranch(
      alert,
      detailWithFortnightStarted(
        alert,
        detailWithRegisterName(
          alert,
          detailWithActorName(detailWithoutSourceAddressHash(alert), namesById),
          namesById,
        ),
        argentinaCalendarDay(now),
      ),
      viewer,
    ),
    openedAt: alert.openedAt.toISOString(),
    escalatedAt: alert.escalatedAt?.toISOString() ?? null,
    resolvedAt: alert.resolvedAt?.toISOString() ?? null,
    open: isOpenAlert(alert),
    closing: alertClosing(alert.kind, DISCARDABLE_REFUND_ALERT_KINDS),
    deliveries: deliveries.map(toAlertDelivery),
  });
}

export function registerAlertReadRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: AlertsRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get(
    "/alerts/:id",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: OPEN_SESSION_ACCESS, sessionSource },
    },
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["id"]);
      if (!ids) {
        return;
      }
      const openSession = openSessionOf(request);
      const sight = visibleSightOf(openSession);
      if (!sight) {
        await reply.code(403).send(FORBIDDEN_RESPONSE);
        return;
      }

      const reader = new DrizzleAlertReader(options.db);
      const alert = await reader.findVisibleAlert(sight, ids.id);
      if (!alert) {
        await reply.code(404).send(ALERT_NOT_FOUND_RESPONSE);
        return;
      }

      const deliveries = await reader.deliveriesOf(alert.id);
      const namesById = await reader.displayNames(alertNamedRecordIds(alert));
      await reply
        .code(200)
        .send(toAlertDetailBody(alert, deliveries, namesById, now(), openSession));
    },
  );
}
