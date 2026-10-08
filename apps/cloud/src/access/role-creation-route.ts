import { roleCreationBodySchema } from "@purosur/contracts";
import { createRole } from "@purosur/domain/permissions/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { backofficeOriginGuard } from "./backoffice-origin.js";
import { DrizzleRoleStore } from "./drizzle-role-store.js";
import { requirePasskeyAuthorization } from "./passkey-authorization-guard.js";
import type { RolesRouteOptions } from "./roles-list-route.js";
import { toRoleSummaryWire } from "./roles-list-route.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "./route-access.js";

export const ROLE_NAME_TAKEN_RESPONSE = {
  code: "role_name_taken",
  message: "a role with that name already exists",
} as const;

export function registerRoleCreationRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RolesRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.post(
    "/roles",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("manage_roles"), sessionSource },
    },
    async (request, reply) => {
      const attemptedAt = now();
      const openSession = openSessionOf(request);

      const parsedBody = await readValidatedBody(reply, roleCreationBodySchema, request.body);
      if (!parsedBody) {
        return;
      }

      if (!(await requirePasskeyAuthorization(openSession, reply, attemptedAt))) {
        return;
      }

      const outcome = await createRole(
        { store: new DrizzleRoleStore(options.db, now) },
        {
          name: parsedBody.name,
          permissionKeys: parsedBody.permissions,
          actorId: openSession.userId,
        },
      );

      if (outcome.kind === "name_taken") {
        await reply.code(409).send(ROLE_NAME_TAKEN_RESPONSE);
        return;
      }

      await reply.code(201).send(toRoleSummaryWire(outcome.role, openSession));
    },
  );
}
