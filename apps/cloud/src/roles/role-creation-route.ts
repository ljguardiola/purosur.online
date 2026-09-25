import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { auditLog, rolePermissions, roles } from "../db/schema.js";
import { requirePasskeyAuthorization } from "../session/passkey-authorization-guard.js";
import {
  ADMINISTRATOR_ACCESS,
  openSessionOf,
  originGuard,
  registerRouteAccess,
  routeSessionSource,
} from "../session/route-access.js";
import {
  type RoleFieldValidationFailure,
  readRoleName,
  readRolePermissionKeys,
  roleNameValidationFailure,
  rolePermissionsValidationFailure,
} from "./role-validation.js";
import type { RoleSummaryRow, RolesRouteOptions } from "./roles-list-route.js";
import { toRoleSummaryWire } from "./roles-list-route.js";

export const ROLE_NAME_TAKEN_RESPONSE = {
  code: "role_name_taken",
  message: "a role with that name already exists",
} as const;

const UNIQUE_VIOLATION = "23505";
const ROLE_NAME_UNIQUE_INDEX = "roles_name_lower_key";

export class RoleNameTaken extends Error {}

/**
 * Walks the driver error (wrapped by Drizzle as its `cause`) for a unique violation on the
 * case-insensitive `roles.name` index. postgres-js, the production driver, names the index
 * `constraint_name`; PGlite, which the unit tests run on, names it `constraint`. The transaction
 * below already checks for a taken name itself, so this is only the backstop for a name that lands
 * concurrently between that check and the insert; `role-edit-route.ts` reuses this same mapping
 * for its own edit transaction.
 */
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

interface CreationRequestBody {
  name: string;
  permissionKeys: string[];
}

function readCreationBody(body: unknown): CreationRequestBody | RoleFieldValidationFailure {
  const name = readRoleName(body);
  const nameFailure = roleNameValidationFailure(name);
  if (nameFailure) {
    return nameFailure;
  }
  if (!name) {
    // Unreachable: `roleNameValidationFailure` above already rejects an empty or missing name.
    return { field: "name", message: "name must not be empty" };
  }
  const permissionKeys = readRolePermissionKeys(body);
  if (!permissionKeys) {
    return { field: "permissions", message: "permissions must be an array of permission keys" };
  }
  const permissionsFailure = rolePermissionsValidationFailure(permissionKeys);
  if (permissionsFailure) {
    return permissionsFailure;
  }
  return { name, permissionKeys };
}

function isValidationFailure(
  value: CreationRequestBody | RoleFieldValidationFailure,
): value is RoleFieldValidationFailure {
  return "field" in value;
}

export interface CreateRoleInput {
  name: string;
  permissionKeys: string[];
  actorId: string;
}

export type CreateRoleOutcome = { kind: "name_taken" } | { kind: "created"; role: RoleSummaryRow };

/**
 * Creates a role, its permission rows, and an audit row in one transaction. The name uniqueness
 * check runs first, inside the transaction; the database's own case-insensitive unique index
 * (`roles_name_lower_key`) is the backstop for a name that lands concurrently, mapped by
 * `isRoleNameUniqueViolation` the same way it would be caught by the check above.
 */
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

/**
 * Registers `POST /roles`: creates a new role, gated by the shared passkey-authorization window
 * (`passkey-authorization-guard.ts`) instead of its own per-action step-up. Creates the role, its
 * permission rows, and an audit row in one transaction; the name uniqueness check runs inside that
 * transaction first, and the database's own case-insensitive unique index
 * (`roles_name_lower_key`) is the backstop for a name that lands concurrently.
 */
export function registerRoleCreationRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RolesRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  function checkOrigin(request: FastifyRequest, reply: FastifyReply): boolean {
    if (request.headers.origin !== options.backofficeOrigin) {
      void reply.code(403).send({
        code: "origin_rejected",
        message: "the request's Origin does not match the backoffice's own origin",
      });
      return false;
    }
    return true;
  }

  app.post(
    "/roles",
    {
      preHandler: originGuard(checkOrigin),
      config: { access: ADMINISTRATOR_ACCESS, sessionSource },
    },
    async (request, reply) => {
      const attemptedAt = now();
      const openSession = openSessionOf(request);

      const parsedBody = readCreationBody(request.body);
      if (isValidationFailure(parsedBody)) {
        await reply.code(400).send({
          code: "validation_failed",
          message: parsedBody.message,
          details: [{ field: parsedBody.field }],
        });
        return;
      }

      if (!(await requirePasskeyAuthorization(openSession, reply, attemptedAt))) {
        return;
      }

      const outcome = await createRole(options.db, {
        name: parsedBody.name,
        permissionKeys: parsedBody.permissionKeys,
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
