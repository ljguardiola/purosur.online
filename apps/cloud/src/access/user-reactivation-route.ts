import { eq } from "drizzle-orm";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { auditLog, users } from "../platform/db/schema.js";
import { findBranchUser } from "./branch-users.js";
import { requirePasskeyAuthorization } from "./passkey-authorization-guard.js";
import {
  openSessionOf,
  originGuard,
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

type ReactivationOutcome = { kind: "not_found" } | { kind: "reactivated" };

export function registerUserReactivationRoutes<TQueryResult extends PgQueryResultHKT>(
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

  // An already-active target answers the same 404 as a missing one.
  async function findTarget(locationId: string, targetId: string) {
    if (!UUID_PATTERN.test(targetId)) {
      return undefined;
    }
    return findBranchUser(options.db, locationId, targetId, { activeScope: "inactive" });
  }

  app.post<{ Params: { id: string } }>(
    "/users/:id/reactivation",
    {
      preHandler: originGuard(checkOrigin),
      config: { access: permissionAccess("reactivate_users"), sessionSource },
    },
    async (request, reply) => {
      const attemptedAt = now();
      const openSession = openSessionOf(request);

      const target = await findTarget(openSession.locationId, request.params.id);
      if (!target) {
        await reply.code(404).send(USER_NOT_FOUND_RESPONSE);
        return;
      }

      if (!(await requirePasskeyAuthorization(openSession, reply, attemptedAt))) {
        return;
      }

      const outcome = await options.db.transaction<ReactivationOutcome>(async (tx) => {
        // Re-reads `active` under the row lock, so a concurrent request against the same target
        // waits, and a second reactivation of an already-active target answers not_found instead
        // of re-auditing it.
        const [current] = await tx
          .select({ active: users.active, version: users.version })
          .from(users)
          .where(eq(users.id, target.id))
          .for("update");
        if (!current || current.active) {
          return { kind: "not_found" };
        }

        await tx
          .update(users)
          .set({ active: true, version: current.version + 1 })
          .where(eq(users.id, target.id));

        await tx.insert(auditLog).values({
          entity: "user",
          entityId: target.id,
          actorId: openSession.userId,
          previousValue: { active: false },
          newValue: { active: true },
        });

        return { kind: "reactivated" };
      });

      if (outcome.kind === "not_found") {
        await reply.code(404).send(USER_NOT_FOUND_RESPONSE);
        return;
      }

      await reply.code(200).send();
    },
  );
}
