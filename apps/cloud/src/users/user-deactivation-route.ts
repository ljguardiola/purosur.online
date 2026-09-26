import { and, eq, isNull } from "drizzle-orm";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { auditLog, roles, sessions, userRoles, users } from "../db/schema.js";
import { requirePasskeyAuthorization } from "../session/passkey-authorization-guard.js";
import {
  openSessionOf,
  originGuard,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../session/route-access.js";
import { findBranchUser } from "./branch-users.js";
import type { UsersRouteOptions } from "./users-list-route.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const USER_NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no user with that id belongs to this branch",
} as const;

type DeactivationOutcome = { kind: "not_found" } | { kind: "deactivated" };

export function registerUserDeactivationRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: UsersRouteOptions<TQueryResult>,
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

  async function findTarget(locationId: string, actorId: string, targetId: string) {
    if (!UUID_PATTERN.test(targetId)) {
      return undefined;
    }
    const row = await findBranchUser(options.db, locationId, targetId);
    if (!row || row.roleIsAdministrator || row.id === actorId) {
      return undefined;
    }
    return row;
  }

  app.post<{ Params: { id: string } }>(
    "/users/:id/deactivation",
    {
      preHandler: originGuard(checkOrigin),
      config: { access: permissionAccess("deactivate_users"), sessionSource },
    },
    async (request, reply) => {
      const attemptedAt = now();
      const openSession = openSessionOf(request);

      const target = await findTarget(
        openSession.locationId,
        openSession.userId,
        request.params.id,
      );
      if (!target) {
        await reply.code(404).send(USER_NOT_FOUND_RESPONSE);
        return;
      }

      if (!(await requirePasskeyAuthorization(openSession, reply, attemptedAt))) {
        return;
      }

      const outcome = await options.db.transaction<DeactivationOutcome>(async (tx) => {
        // Locks the Administrator role row, then the user row, in the edit route's order so the
        // two never deadlock, and re-reads `active` and the role under those locks.
        const [administratorRole] = await tx
          .select({ id: roles.id })
          .from(roles)
          .where(eq(roles.isAdministrator, true))
          .for("update");
        const [current] = await tx
          .select({ active: users.active, version: users.version })
          .from(users)
          .where(eq(users.id, target.id))
          .for("update");
        if (!current?.active) {
          return { kind: "not_found" };
        }
        const [currentRole] = await tx
          .select({ roleId: userRoles.roleId })
          .from(userRoles)
          .where(eq(userRoles.userId, target.id));
        if (currentRole?.roleId === administratorRole?.id) {
          return { kind: "not_found" };
        }

        await tx
          .update(users)
          .set({ active: false, version: current.version + 1 })
          .where(eq(users.id, target.id));

        await tx
          .update(sessions)
          .set({ revokedAt: attemptedAt })
          .where(and(eq(sessions.userId, target.id), isNull(sessions.revokedAt)));

        await tx.insert(auditLog).values({
          entity: "user",
          entityId: target.id,
          actorId: openSession.userId,
          previousValue: { active: true },
          newValue: { active: false },
        });

        return { kind: "deactivated" };
      });

      if (outcome.kind === "not_found") {
        await reply.code(404).send(USER_NOT_FOUND_RESPONSE);
        return;
      }

      await reply.code(200).send();
    },
  );
}
