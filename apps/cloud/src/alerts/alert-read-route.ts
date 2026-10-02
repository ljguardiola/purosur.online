import { type AlertDetail, alertDetailSchema } from "@purosur/contracts";
import { isOpenAlert } from "@purosur/domain";
import type { AlertDelivery, AlertDetailView } from "@purosur/domain/alerts/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../access/backoffice-origin.js";
import { FORBIDDEN_RESPONSE } from "../access/forbidden-response.js";
import {
  OPEN_SESSION_ACCESS,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { readRecordIds } from "../platform/record-id-params.js";
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
  const actorId = detail["actorId"];
  if (typeof actorId !== "string") {
    return detail;
  }
  const actorName = namesById.get(actorId);
  return actorName === undefined ? detail : { ...detail, actorName };
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
    open: isOpenAlert(alert),
    deliveries: deliveries.map(toAlertDelivery),
  });
}

export function registerAlertReadRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: AlertsRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
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
      const namesById = await reader.displayNames(idsToResolve(alert));
      await reply.code(200).send(toAlertDetailBody(alert, deliveries, namesById));
    },
  );
}

export function idsToResolve(alert: Pick<AlertDetailView, "scope" | "detail">): string[] {
  const actorId = alert.detail["actorId"];
  return typeof actorId === "string" ? [alert.scope, actorId] : [alert.scope];
}
