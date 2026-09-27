import { isAlertKind } from "@purosur/contracts";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { alerts, auditLog } from "../db/schema.js";
import {
  openSessionOf,
  originGuard,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../session/route-access.js";
import { hashSourceAddress } from "../session/sign-in-lockout.js";
import { alertKindDefinition } from "./alert-kind-catalog.js";
import {
  ALERT_NOT_FOUND_RESPONSE,
  type AlertDetailRow,
  findAlertById,
  listAlertDeliveries,
  toAlertDetailWire,
  userIdsToResolve,
} from "./alert-read-route.js";
import { loadScopeDisplayNames } from "./alert-scope-display.js";
import type { AlertsRouteOptions } from "./alerts-list-route.js";

const ALREADY_CLOSED_RESPONSE = {
  code: "already_closed",
  message: "this alert was already closed",
} as const;

export type CloseAlertOutcome =
  | { kind: "already_closed" }
  | { kind: "closed"; alert: AlertDetailRow };

// Closed rows are permanent, so the raw address is hashed rather than kept indefinitely.
function withoutSourceAddress(alert: {
  kind: string;
  scope: string;
  detail: Record<string, unknown>;
}): { scope: string; detail: Record<string, unknown> } | Record<string, never> {
  if (!isAlertKind(alert.kind) || alertKindDefinition(alert.kind).scopeKind !== "sourceAddress") {
    return {};
  }
  const { sourceAddress } = alert.detail;
  return {
    scope: hashSourceAddress(alert.scope),
    detail: {
      ...alert.detail,
      ...(typeof sourceAddress === "string"
        ? { sourceAddress: hashSourceAddress(sourceAddress) }
        : {}),
    },
  };
}

export async function closeAlert<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: { id: string; actorId: string },
  deps: { now: () => Date },
): Promise<CloseAlertOutcome> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        kind: alerts.kind,
        scope: alerts.scope,
        detail: alerts.detail,
        resolvedAt: alerts.resolvedAt,
      })
      .from(alerts)
      .where(eq(alerts.id, input.id))
      .for("update");
    if (!current) {
      throw new Error(`closeAlert: no alert found for id ${input.id}`);
    }
    if (current.resolvedAt !== null) {
      return { kind: "already_closed" };
    }

    const resolvedAt = deps.now();
    const [updated] = await tx
      .update(alerts)
      .set({ resolvedAt, resolvedBy: input.actorId, ...withoutSourceAddress(current) })
      .where(eq(alerts.id, input.id))
      .returning();
    if (!updated) {
      throw new Error(`closeAlert: updating alert ${input.id} returned no row`);
    }

    await tx.insert(auditLog).values({
      entity: "alert",
      entityId: input.id,
      actorId: input.actorId,
      previousValue: { resolvedAt: null },
      newValue: { resolvedAt: resolvedAt.toISOString() },
    });

    return { kind: "closed", alert: updated };
  });
}

export function registerAlertCloseRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: AlertsRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  function checkOrigin(request: FastifyRequest, reply: FastifyReply): boolean {
    if (request.headers.origin !== options.backofficeOrigin) {
      void reply.code(403).send({
        code: "origin_rejected",
        message: "the request's Origin does not match the backoffice's own origin",
      });
      return false;
    }
    return true;
  }

  app.post<{ Params: { id: string } }>(
    "/alerts/:id/close",
    {
      preHandler: originGuard(checkOrigin),
      config: { access: permissionAccess("dismiss_alerts_manually"), sessionSource },
    },
    async (request, reply) => {
      const openSession = openSessionOf(request);

      const alert = await findAlertById(options.db, request.params.id, openSession);
      if (!alert) {
        await reply.code(404).send(ALERT_NOT_FOUND_RESPONSE);
        return;
      }

      const outcome = await closeAlert(
        options.db,
        { id: alert.id, actorId: openSession.userId },
        { now },
      );
      if (outcome.kind === "already_closed") {
        await reply.code(409).send(ALREADY_CLOSED_RESPONSE);
        return;
      }

      const deliveries = await listAlertDeliveries(options.db, outcome.alert.id);
      const namesByUserId = await loadScopeDisplayNames(
        options.db,
        userIdsToResolve(outcome.alert),
      );
      await reply.code(200).send(toAlertDetailWire(outcome.alert, deliveries, namesByUserId));
    },
  );
}
