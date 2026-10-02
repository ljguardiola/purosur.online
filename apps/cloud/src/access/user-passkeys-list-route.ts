import { passkeyListSchema } from "@purosur/contracts";
import { listUserPasskeys } from "@purosur/domain/access/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "./backoffice-origin.js";
import { canReactivateUsers } from "./branch-users.js";
import { drizzleBranchUsers } from "./drizzle-branch-users.js";
import { drizzlePasskeys } from "./drizzle-passkeys.js";
import {
  ADMINISTRATOR_ACCESS,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "./route-access.js";
import type { UsersRouteOptions } from "./users-list-route.js";

const NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no user with that id belongs to this branch",
} as const;

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
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: ADMINISTRATOR_ACCESS, sessionSource },
    },
    async (request, reply) => {
      const openSession = openSessionOf(request);

      const targetId = (request.params as { id: string }).id;

      const listed = await listUserPasskeys(
        { users: drizzleBranchUsers(options.db), passkeys: drizzlePasskeys(options.db) },
        {
          locationId: openSession.locationId,
          userId: targetId,
          activeScope: canReactivateUsers(openSession) ? "any" : "active",
        },
      );
      if (listed.kind === "not_found") {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }

      await reply.code(200).send(
        passkeyListSchema.parse(
          listed.passkeys.map((row) => ({
            id: row.id,
            name: row.name,
            created_at: row.createdAt.toISOString(),
            last_used_at: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
          })),
        ),
      );
    },
  );
}
