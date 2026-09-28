import { and, eq, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { auditLog, roles, sessions, userRoles, users } from "../platform/db/schema.js";
import { backofficeOriginGuard } from "./backoffice-origin.js";
import { findBranchUser } from "./branch-users.js";
import { requirePasskeyAuthorization } from "./passkey-authorization-guard.js";
import {
  openSessionOf,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "./route-access.js";
import type { UsersRouteOptions } from "./users-list-route.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const USER_NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no user with that id belongs to this branch",
} as const;

export interface DeactivateUserInput {
  id: string;
  actorId: string;
  at: Date;
}

export type DeactivateUserOutcome = { kind: "not_found" } | { kind: "deactivated" };

export async function deactivateUser<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: DeactivateUserInput,
): Promise<DeactivateUserOutcome> {
  return db.transaction<DeactivateUserOutcome>(async (tx) => {
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
      .where(eq(users.id, input.id))
      .for("update");
    if (!current?.active) {
      return { kind: "not_found" };
    }
    const [currentRole] = await tx
      .select({ roleId: userRoles.roleId })
      .from(userRoles)
      .where(eq(userRoles.userId, input.id));
    if (currentRole?.roleId === administratorRole?.id) {
      return { kind: "not_found" };
    }

    await tx
      .update(users)
      .set({ active: false, version: current.version + 1 })
      .where(eq(users.id, input.id));

    await tx
      .update(sessions)
      .set({ revokedAt: input.at })
      .where(and(eq(sessions.userId, input.id), isNull(sessions.revokedAt)));

    await tx.insert(auditLog).values({
      entity: "user",
      entityId: input.id,
      actorId: input.actorId,
      previousValue: { active: true },
      newValue: { active: false },
    });

    return { kind: "deactivated" };
  });
}

export function registerUserDeactivationRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: UsersRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

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
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
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

      const outcome = await deactivateUser(options.db, {
        id: target.id,
        actorId: openSession.userId,
        at: attemptedAt,
      });

      if (outcome.kind === "not_found") {
        await reply.code(404).send(USER_NOT_FOUND_RESPONSE);
        return;
      }

      await reply.code(200).send();
    },
  );
}
