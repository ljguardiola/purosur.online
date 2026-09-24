import { asc, eq } from "drizzle-orm";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { passkeys } from "../db/schema.js";
import { checkRequestIsSameOrigin } from "../session/open-session.js";
import {
  ADMINISTRATOR_ACCESS,
  openSessionOf,
  originGuard,
  registerRouteAccess,
  routeSessionSource,
} from "../session/route-access.js";
import { findBranchUser } from "./branch-users.js";
import type { UsersRouteOptions } from "./users-list-route.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Answers identically whether the id is malformed, unknown, or belongs to another branch, same as
// `user-read-route.ts`.
const NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no user with that id belongs to this branch",
} as const;

/**
 * Registers `GET /users/:id/passkeys`: same session, origin, and Administrator-only guard as
 * `GET /users/:id`, then lists the target user's passkeys in the same row shape
 * `passkeys-list-route.ts` returns for the session's own account. A malformed id, a missing id,
 * and an id from another branch all get the identical 404 `not_found`.
 */
export function registerUserPasskeysListRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: UsersRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get(
    "/users/:id/passkeys",
    {
      preHandler: originGuard((request, reply) =>
        checkRequestIsSameOrigin(request, reply, options.backofficeOrigin),
      ),
      config: { access: ADMINISTRATOR_ACCESS, sessionSource },
    },
    async (request, reply) => {
      const openSession = openSessionOf(request);

      const targetId = (request.params as { id: string }).id;
      if (!UUID_PATTERN.test(targetId)) {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }

      const target = await findBranchUser(options.db, openSession.locationId, targetId);
      if (!target) {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }

      const rows = await options.db
        .select({
          id: passkeys.id,
          name: passkeys.name,
          createdAt: passkeys.createdAt,
          lastUsedAt: passkeys.lastUsedAt,
        })
        .from(passkeys)
        .where(eq(passkeys.userId, target.id))
        .orderBy(asc(passkeys.createdAt));

      await reply.code(200).send(
        rows.map((row) => ({
          id: row.id,
          name: row.name,
          created_at: row.createdAt.toISOString(),
          last_used_at: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
        })),
      );
    },
  );
}
