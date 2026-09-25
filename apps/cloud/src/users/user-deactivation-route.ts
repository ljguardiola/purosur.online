import { and, eq, isNull } from "drizzle-orm";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { auditLog, sessions, users } from "../db/schema.js";
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

// Same shape (and same "malformed/missing/other-branch/inactive/Administrator are
// indistinguishable" reasoning) `user-read-route.ts` answers with: an Administrator is never
// offered as a target, so attempting one gets the same 404 as one that doesn't exist.
const USER_NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no user with that id belongs to this branch",
} as const;

type DeactivationOutcome = { kind: "not_found" } | { kind: "deactivated" };

/**
 * Registers `POST /users/:id/deactivation`: lets a holder of `deactivate_users` (an Administrator
 * always holds it too) deactivate another branch user, gated by the shared passkey-authorization
 * window (`passkey-authorization-guard.ts`) instead of its own per-action step-up. Checks the
 * target belongs to the session's own branch, is still active, is not an Administrator, and is not
 * the actor themselves before doing anything else (identical 404 for a malformed, missing,
 * other-branch, inactive, Administrator, or own id — an Administrator is never deactivated through
 * this permission, not even by another Administrator). A successful deactivation ends every
 * backoffice session already open on the target's account, the same way removing their last passkey
 * would, and audits the target's id alongside the actor who did it.
 */
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

  /**
   * Folds a malformed id, an Administrator target, and the actor's own account (a deactivation
   * cannot be undone) into the same 404 a missing id gets.
   */
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
        // Locks this row before checking it, the same way `user-email-change-route.ts` does: a
        // concurrent deactivation of the same target waits instead of racing, and re-reads
        // `active` under the lock so a second request against an already-deactivated target
        // never re-revokes sessions or re-audits.
        const [current] = await tx
          .select({ active: users.active, version: users.version })
          .from(users)
          .where(eq(users.id, target.id))
          .for("update");
        if (!current?.active) {
          return { kind: "not_found" };
        }

        await tx
          .update(users)
          .set({ active: false, version: current.version + 1 })
          .where(eq(users.id, target.id));

        // A deactivated user's open backoffice session ends at once (drafts/docs §12.3, CA-ACC-19),
        // the same way removing their last passkey ends every session already open on the account.
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
