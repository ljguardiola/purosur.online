import { userEditBodySchema } from "@purosur/contracts";
import { editUser, findBranchUser } from "@purosur/domain/users/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { backofficeOriginGuard } from "../access/backoffice-origin.js";
import { readCurrentOpenSession, UNAUTHENTICATED_RESPONSE } from "../access/open-session.js";
import { requirePasskeyAuthorization } from "../access/passkey-authorization-guard.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { readRecordIds } from "../platform/record-id-params.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { toBranchUserWire } from "./branch-users.js";
import { drizzleBranchUsers } from "./drizzle-branch-users.js";
import { DrizzleUserStore } from "./drizzle-user-store.js";
import type { UserChangeRouteOptions } from "./users-list-route.js";

const NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no user with that id belongs to this branch",
} as const;

const EMAIL_TAKEN_RESPONSE = {
  code: "email_taken",
  message: "a user with that email already exists",
} as const;

const STALE_VERSION_RESPONSE = {
  code: "stale_version",
  message: "this user was changed since it was loaded",
} as const;

const UNKNOWN_ROLE_RESPONSE = {
  code: "validation_failed",
  message: "role_id must be an existing role's id",
  details: [{ field: "role_id" }],
} as const;

const LAST_ADMINISTRATOR_RESPONSE = {
  code: "last_administrator",
  message: "the only active Administrator can't have their role changed away from it",
} as const;

export function registerUserEditRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: UserChangeRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.put(
    "/users/:id",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("manage_users"), sessionSource },
    },
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["id"]);
      if (!ids) {
        return;
      }
      const attemptedAt = now();
      const openSession = openSessionOf(request);

      if (!(await requirePasskeyAuthorization(openSession, reply, attemptedAt))) {
        return;
      }

      const target = await findBranchUser(
        { users: drizzleBranchUsers(options.db) },
        { locationId: openSession.locationId, userId: ids.id },
      );
      if (!target) {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }

      const parsedBody = await readValidatedBody(reply, userEditBodySchema, request.body);
      if (!parsedBody) {
        return;
      }

      const outcome = await editUser(
        {
          store: new DrizzleUserStore(options.db, now, options.voidOutstandingRecoveryTokens),
          clock: { now },
        },
        {
          id: target.id,
          locationId: openSession.locationId,
          email: parsedBody.email,
          roleId: parsedBody.role_id,
          version: parsedBody.version,
          actorId: openSession.userId,
        },
      );

      if (outcome.kind === "unknown_role") {
        await reply.code(400).send(UNKNOWN_ROLE_RESPONSE);
        return;
      }
      if (outcome.kind === "stale_version") {
        await reply.code(409).send(STALE_VERSION_RESPONSE);
        return;
      }
      if (outcome.kind === "email_taken") {
        await reply.code(409).send(EMAIL_TAKEN_RESPONSE);
        return;
      }
      if (outcome.kind === "last_administrator") {
        await reply.code(409).send(LAST_ADMINISTRATOR_RESPONSE);
        return;
      }

      const sessionAfterEdit = await readCurrentOpenSession(request, {
        db: options.db,
        now: attemptedAt,
      });
      if (!sessionAfterEdit) {
        await reply.code(401).send(UNAUTHENTICATED_RESPONSE);
        return;
      }
      await reply.code(200).send(toBranchUserWire(outcome.user, sessionAfterEdit));
    },
  );
}
