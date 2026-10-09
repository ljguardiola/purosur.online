import { passkeyListSchema } from "@purosur/contracts";
import { listUserPasskeys } from "@purosur/domain/credentials/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readRecordIds } from "../platform/record-id-params.js";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { canReactivateUsers } from "../users/branch-users.js";
import type { UsersRouteOptions } from "../users/users-list-route.js";
import { drizzlePasskeyHolders } from "./drizzle-passkey-holders.js";
import { drizzlePasskeys } from "./drizzle-passkeys.js";

const NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no user with that id belongs to this branch",
} as const;

export function registerUserPasskeysListRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: UsersRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get(
    "/users/:id/passkeys",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("manage_users"), sessionSource },
    },
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["id"]);
      if (!ids) {
        return;
      }
      const openSession = openSessionOf(request);

      const targetId = ids.id;

      const listed = await listUserPasskeys(
        { holders: drizzlePasskeyHolders(options.db), passkeys: drizzlePasskeys(options.db) },
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
