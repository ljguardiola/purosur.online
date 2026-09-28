import { roleCreationBodySchema } from "@purosur/contracts";
import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { auditLog, rolePermissions, roles } from "../platform/db/schema.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { backofficeOriginGuard } from "./backoffice-origin.js";
import { requirePasskeyAuthorization } from "./passkey-authorization-guard.js";
import type { RoleSummaryRow, RolesRouteOptions } from "./roles-list-route.js";
import { toRoleSummaryWire } from "./roles-list-route.js";
import {
  ADMINISTRATOR_ACCESS,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "./route-access.js";

export const ROLE_NAME_TAKEN_RESPONSE = {
  code: "role_name_taken",
  message: "a role with that name already exists",
} as const;

const UNIQUE_VIOLATION = "23505";
const ROLE_NAME_UNIQUE_INDEX = "roles_name_lower_key";

export class RoleNameTaken extends Error {}

// Drizzle wraps the driver error as `cause`. postgres-js names the index `constraint_name`; PGlite names it `constraint`.
export function isRoleNameUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    const { code, constraint, constraint_name } = current as {
      code?: unknown;
      constraint?: unknown;
      constraint_name?: unknown;
    };
    const index = constraint_name ?? constraint;
    if (code === UNIQUE_VIOLATION && index === ROLE_NAME_UNIQUE_INDEX) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

export interface CreateRoleInput {
  name: string;
  permissionKeys: string[];
  actorId: string;
}

export type CreateRoleOutcome = { kind: "name_taken" } | { kind: "created"; role: RoleSummaryRow };

// The case-insensitive check runs inside the transaction; the database's own unique index
// (roles_name_lower_key) is the backstop for a name that lands concurrently.
export async function createRole<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: CreateRoleInput,
): Promise<CreateRoleOutcome> {
  const created = await db
    .transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(sql`lower(${roles.name}) = lower(${input.name})`)
        .limit(1);
      if (existing) {
        throw new RoleNameTaken();
      }

      const [newRole] = await tx
        .insert(roles)
        .values({ name: input.name, isAdministrator: false })
        .returning({ id: roles.id });
      if (!newRole) {
        throw new Error("inserting the role returned no row");
      }

      if (input.permissionKeys.length > 0) {
        await tx.insert(rolePermissions).values(
          input.permissionKeys.map((permissionKey) => ({
            roleId: newRole.id,
            permissionKey,
          })),
        );
      }

      await tx.insert(auditLog).values({
        entity: "role",
        entityId: newRole.id,
        actorId: input.actorId,
        previousValue: null,
        newValue: { name: input.name, permissions: input.permissionKeys },
      });

      return newRole;
    })
    .catch((error: unknown) => {
      if (error instanceof RoleNameTaken || isRoleNameUniqueViolation(error)) {
        return undefined;
      }
      throw error;
    });

  if (!created) {
    return { kind: "name_taken" };
  }
  return {
    kind: "created",
    role: {
      id: created.id,
      name: input.name,
      isAdministrator: false,
      permissionKeys: input.permissionKeys,
      userCount: 0,
    },
  };
}

export function registerRoleCreationRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RolesRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.post(
    "/roles",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: ADMINISTRATOR_ACCESS, sessionSource },
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

      const outcome = await createRole(options.db, {
        name: parsedBody.name,
        permissionKeys: parsedBody.permissions,
        actorId: openSession.userId,
      });

      if (outcome.kind === "name_taken") {
        await reply.code(409).send(ROLE_NAME_TAKEN_RESPONSE);
        return;
      }

      await reply.code(201).send(toRoleSummaryWire(outcome.role));
    },
  );
}
