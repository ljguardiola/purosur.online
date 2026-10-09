import { listBranchUsers } from "@purosur/domain/users/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { canReactivateUsers, toBranchUserWire } from "./branch-users.js";
import { drizzleBranchUsers } from "./drizzle-branch-users.js";
import type { VoidOutstandingRecoveryTokens } from "./drizzle-user-store.js";

export interface UsersRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
}

export interface UserChangeRouteOptions<TQueryResult extends PgQueryResultHKT>
  extends UsersRouteOptions<TQueryResult> {
  voidOutstandingRecoveryTokens: VoidOutstandingRecoveryTokens;
}

export function registerUsersListRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: UsersRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get(
    "/users",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: {
        access: capabilityAccess("users_area"),
        sessionSource,
      },
    },
    async (request, reply) => {
      const openSession = openSessionOf(request);
      const includesInactive = canReactivateUsers(openSession);

      const rows = await listBranchUsers(
        { users: drizzleBranchUsers(options.db) },
        {
          locationId: openSession.locationId,
          activeScope: includesInactive ? "any" : "active",
        },
      );
      await reply
        .code(200)
        .send(
          rows.map((row) =>
            toBranchUserWire(row, openSession, { includeActive: includesInactive }),
          ),
        );
    },
  );
}
