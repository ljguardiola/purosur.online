import { roleEditBodySchema } from "@purosur/contracts";
import { editRole, findEditableRole } from "@purosur/domain/access/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { backofficeOriginGuard } from "./backoffice-origin.js";
import { drizzleRoleDirectory } from "./drizzle-role-directory.js";
import { DrizzleRoleStore } from "./drizzle-role-store.js";
import { requirePasskeyAuthorization } from "./passkey-authorization-guard.js";
import { ROLE_NAME_TAKEN_RESPONSE } from "./role-creation-route.js";
import { toRoleDetailWire } from "./role-read-route.js";
import type { RolesRouteOptions } from "./roles-list-route.js";
import {
  ADMINISTRATOR_ACCESS,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "./route-access.js";

const NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no editable role with that id",
} as const;

const STALE_VERSION_RESPONSE = {
  code: "stale_version",
  message: "this role was changed since it was loaded",
} as const;

export function registerRoleEditRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RolesRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.put<{ Params: { id: string } }>(
    "/roles/:id",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: ADMINISTRATOR_ACCESS, sessionSource },
    },
    async (request, reply) => {
      const attemptedAt = now();
      const openSession = openSessionOf(request);

      const target = await findEditableRole(
        { roles: drizzleRoleDirectory(options.db) },
        { roleId: request.params.id },
      );
      if (!target) {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }

      const parsedBody = await readValidatedBody(reply, roleEditBodySchema, request.body);
      if (!parsedBody) {
        return;
      }

      if (!(await requirePasskeyAuthorization(openSession, reply, attemptedAt))) {
        return;
      }

      const outcome = await editRole(
        { store: new DrizzleRoleStore(options.db), clock: { now } },
        {
          id: target.id,
          name: parsedBody.name,
          permissionKeys: parsedBody.permissions,
          version: parsedBody.version,
          actorId: openSession.userId,
        },
      );

      if (outcome.kind === "stale_version") {
        await reply.code(409).send(STALE_VERSION_RESPONSE);
        return;
      }
      if (outcome.kind === "name_taken") {
        await reply.code(409).send(ROLE_NAME_TAKEN_RESPONSE);
        return;
      }

      await reply.code(200).send(toRoleDetailWire(outcome.role));
    },
  );
}
