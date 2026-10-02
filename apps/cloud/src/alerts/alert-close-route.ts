import { closeAlert } from "@purosur/domain/alerts/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { backofficeOriginGuard } from "../access/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { hashSourceAddress } from "../access/sign-in-lockout.js";
import { readRecordIds } from "../platform/record-id-params.js";
import { ALERT_NOT_FOUND_RESPONSE, idsToResolve, toAlertDetailBody } from "./alert-read-route.js";
import { visibleSightOf } from "./alert-route-sight.js";
import type { AlertsRouteOptions } from "./alerts-list-route.js";
import { DrizzleAlertReader } from "./drizzle-alert-reader.js";
import { DrizzleAlertStore } from "./drizzle-alert-store.js";

const ALREADY_CLOSED_RESPONSE = {
  code: "already_closed",
  message: "this alert was already closed",
} as const;

export function registerAlertCloseRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: AlertsRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzleAlertReader(options.db);
  const closingPorts = {
    store: new DrizzleAlertStore(options.db),
    clock: { now },
    hasher: { hash: hashSourceAddress },
  };

  app.put(
    "/alerts/:id/closure",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("close_alerts_manually"), sessionSource },
    },
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["id"]);
      if (!ids) {
        return;
      }
      const openSession = openSessionOf(request);
      const sight = visibleSightOf(openSession);

      const alert = sight && (await reader.findVisibleAlert(sight, ids.id));
      if (!alert) {
        await reply.code(404).send(ALERT_NOT_FOUND_RESPONSE);
        return;
      }

      const outcome = await closeAlert(closingPorts, {
        alertId: alert.id,
        closedBy: openSession.userId,
      });
      if (outcome.kind === "not_found") {
        await reply.code(404).send(ALERT_NOT_FOUND_RESPONSE);
        return;
      }
      if (outcome.kind === "already_closed") {
        await reply.code(409).send(ALREADY_CLOSED_RESPONSE);
        return;
      }

      const { level, escalatedAt, scope, detail, closedAt, closedBy } = outcome.alert;
      const closed = {
        ...alert,
        level,
        escalatedAt,
        scope,
        detail,
        resolvedAt: closedAt,
        resolvedBy: closedBy,
      };
      const deliveries = await reader.deliveriesOf(alert.id);
      const namesById = await reader.displayNames(idsToResolve(closed));
      await reply.code(200).send(toAlertDetailBody(closed, deliveries, namesById));
    },
  );
}
