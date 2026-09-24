import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { checkRequestIsSameOrigin, requireOpenSession } from "../session/open-session.js";
import { listBranchUsers, toBranchUserWire } from "./branch-users.js";
import { FORBIDDEN_RESPONSE } from "./forbidden-response.js";

export interface UsersRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  /** Injected in tests so idle/absolute expiry are checked against a deterministic clock. */
  now?: () => Date;
}

/**
 * Registers `GET /users`: requires an open session (the same `requireOpenSession` check
 * `GET /users/passkeys` uses, including its same-origin guard), then lists the users of the
 * session's own branch with their role. Administrator-only for now — a wider permission model
 * arrives with a later Roles issue — so a non-Administrator gets 403 `forbidden` instead of a list.
 */
export function registerUsersListRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: UsersRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());

  app.get("/users", async (request, reply) => {
    if (!checkRequestIsSameOrigin(request, reply, options.backofficeOrigin)) {
      return;
    }
    const checkedAt = now();
    const openSession = await requireOpenSession(request, reply, {
      db: options.db,
      now: checkedAt,
    });
    if (!openSession) {
      return;
    }
    if (!openSession.isAdministrator) {
      await reply.code(403).send(FORBIDDEN_RESPONSE);
      return;
    }

    const rows = await listBranchUsers(options.db, openSession.locationId);
    await reply.code(200).send(rows.map(toBranchUserWire));
  });
}
