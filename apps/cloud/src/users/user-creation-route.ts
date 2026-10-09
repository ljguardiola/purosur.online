import { userCreationBodySchema } from "@purosur/contracts";
import { createUser } from "@purosur/domain/users/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { backofficeOriginGuard } from "../sessions/backoffice-origin.js";
import { requirePasskeyAuthorization } from "../sessions/passkey-authorization-guard.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { canReactivateUsers, toBranchUserWire } from "./branch-users.js";
import { DrizzleUserStore } from "./drizzle-user-store.js";
import type { UserChangeRouteOptions } from "./users-list-route.js";

const UNKNOWN_ROLE_RESPONSE = {
  code: "unknown_role",
  message: "no role with that id exists",
} as const;

const EMAIL_TAKEN_RESPONSE = {
  code: "email_taken",
  message: "a user with that email already exists",
} as const;

function emailBelongsToDeactivatedUserResponse(target: { id: string; firstName: string }) {
  return {
    code: "email_belongs_to_deactivated_user",
    message: "that email belongs to a deactivated user; reactivate them instead",
    id: target.id,
    name: target.firstName,
  } as const;
}

export function registerUserCreationRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: UserChangeRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.post(
    "/users",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("manage_users"), sessionSource },
    },
    async (request, reply) => {
      const attemptedAt = now();
      const openSession = openSessionOf(request);

      const parsedBody = await readValidatedBody(reply, userCreationBodySchema, request.body);
      if (!parsedBody) {
        return;
      }

      if (!(await requirePasskeyAuthorization(openSession, reply, attemptedAt))) {
        return;
      }

      const outcome = await createUser(
        {
          store: new DrizzleUserStore(options.db, now, options.voidOutstandingRecoveryTokens),
          clock: { now },
        },
        {
          firstName: parsedBody.first_name,
          email: parsedBody.email,
          roleId: parsedBody.role_id,
          locationId: openSession.locationId,
          actorId: openSession.userId,
          actorMayReactivateUsers: canReactivateUsers(openSession),
        },
      );

      if (outcome.kind === "unknown_role") {
        await reply.code(400).send(UNKNOWN_ROLE_RESPONSE);
        return;
      }

      if (outcome.kind === "email_belongs_to_deactivated_user") {
        await reply
          .code(409)
          .send(
            emailBelongsToDeactivatedUserResponse({ id: outcome.id, firstName: outcome.firstName }),
          );
        return;
      }

      if (outcome.kind === "email_taken") {
        await reply.code(409).send(EMAIL_TAKEN_RESPONSE);
        return;
      }

      await reply.code(201).send(toBranchUserWire(outcome.user, openSession));
    },
  );
}
