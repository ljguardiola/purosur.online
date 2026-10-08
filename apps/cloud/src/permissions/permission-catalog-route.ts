import { permissionCatalogSchema } from "@purosur/contracts";
import {
  PERMISSION_AREAS,
  PERMISSION_CATALOG,
  type PermissionKey,
  permissionsRequiring,
  withRequiredPermissions,
} from "@purosur/domain";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../access/backoffice-origin.js";
import {
  OPEN_SESSION_ACCESS,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import type { RolesRouteOptions } from "./roles-list-route.js";

function requirementsOf(key: PermissionKey): PermissionKey[] {
  return [...withRequiredPermissions([key])].filter((required) => required !== key);
}

function permissionCatalogWire() {
  return permissionCatalogSchema.parse(
    PERMISSION_AREAS.map((area) => ({
      area,
      permissions: PERMISSION_CATALOG.filter((definition) => definition.area === area).map(
        ({ key, registerMarker }) => ({
          key,
          register_marker: registerMarker,
          requires: requirementsOf(key),
          required_by: permissionsRequiring(key),
        }),
      ),
    })),
  );
}

export function registerPermissionCatalogRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RolesRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get(
    "/permission-catalog",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: OPEN_SESSION_ACCESS, sessionSource },
    },
    async (_request, reply) => {
      await reply.code(200).send(permissionCatalogWire());
    },
  );
}
