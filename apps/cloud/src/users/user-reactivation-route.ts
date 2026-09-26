import { eq } from "drizzle-orm";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { auditLog, users } from "../db/schema.js";
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

// Same shape `user-deactivation-route.ts` answers with for a malformed, missing, other-branch, or
// (here) still-active target: none of them leaks which one it was.
const USER_NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no user with that id belongs to this branch",
} as const;

type ReactivationOutcome = { kind: "not_found" } | { kind: "reactivated" };

/**
 * Registers `POST /users/:id/reactivation`: lets a holder of `reactivate_users` (an Administrator
 * always holds it too) reactivate a branch user `user-deactivation-route.ts` had deactivated,
 * gated by the shared passkey-authorization window instead of its own per-action step-up. Checks
 * the target belongs to the session's own branch and is still inactive before doing anything else
 * (identical 404 for a malformed, missing, other-branch, or already-active id). Keeps the target's
 * role, email, and passkeys untouched, and audits the target's id alongside the actor who did it.
 */
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

  /** Folds a malformed id and an already-active target into the same 404 a missing id gets. */
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
        // Takes the user row lock, then re-reads `active` under it: a concurrent reactivation (or
        // deactivation) of the same target waits, and a second request against an already-active
        // target answers not_found instead of re-reactivating and re-auditing.
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
