import { type RoleDetailWire, roleDetailSchema } from "@purosur/contracts";
import {
  findEditableRole,
  type RoleHolder,
  type RoleSummary,
} from "@purosur/domain/access/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readRecordIds } from "../platform/record-id-params.js";
import { sameOriginGuard } from "./backoffice-origin.js";
import { drizzleRoleDirectory } from "./drizzle-role-directory.js";
import type { RolesRouteOptions } from "./roles-list-route.js";
import { toRoleSummaryWire } from "./roles-list-route.js";
import { capabilityAccess, registerRouteAccess, routeSessionSource } from "./route-access.js";

const NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no editable role with that id",
} as const;

export interface RoleDetailRow extends RoleSummary {
  version: number;
  assignedUsers: RoleHolder[];
}

export function toRoleDetailWire(row: RoleDetailRow): RoleDetailWire {
  return roleDetailSchema.parse({
    ...toRoleSummaryWire(row),
    version: row.version,
    assigned_users: row.assignedUsers,
  });
}

export function registerRoleReadRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RolesRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get(
    "/roles/:id",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("manage_roles"), sessionSource },
    },
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["id"]);
      if (!ids) {
        return;
      }
      const targetId = ids.id;
      const role = await findEditableRole(
        { roles: drizzleRoleDirectory(options.db) },
        { roleId: targetId },
      );
      if (!role) {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }

      await reply.code(200).send(toRoleDetailWire(role));
    },
  );
}
