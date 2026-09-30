import { roleEditBodySchema } from "@purosur/contracts";
import { grantedPermissionKeys, increasesAccess, PERMISSION_KEYS } from "@purosur/domain";
import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { openAlert } from "../alerts/open-alert.js";
import { auditLog, rolePermissions, roles } from "../platform/db/schema.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { withPendingChanges } from "../sync/change-log.js";
import { backofficeOriginGuard } from "./backoffice-origin.js";
import { requirePasskeyAuthorization } from "./passkey-authorization-guard.js";
import {
  isRoleNameUniqueViolation,
  ROLE_NAME_TAKEN_RESPONSE,
  RoleNameTaken,
} from "./role-creation-route.js";
import {
  type AssignedUser,
  findEditableRole,
  listRoleUsers,
  toRoleDetailWire,
} from "./role-read-route.js";
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

export interface EditRoleInput {
  id: string;
  name: string;
  permissionKeys: string[];
  version: number;
  actorId: string;
}

interface EditedRole {
  id: string;
  name: string;
  isAdministrator: false;
  permissionKeys: string[];
  userCount: number;
  version: number;
  assignedUsers: AssignedUser[];
}

export interface EditRoleDeps {
  now: () => Date;
}

export type EditRoleOutcome =
  | { kind: "stale_version" }
  | { kind: "name_taken" }
  | { kind: "applied"; role: EditedRole };

export async function editRole<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: EditRoleInput,
  deps: EditRoleDeps,
): Promise<EditRoleOutcome> {
  const outcome = await withPendingChanges<TQueryResult, EditRoleOutcome>(
    db,
    undefined,
    async (tx, changes) => {
      // Locks this row so a concurrent edit against the same role waits instead of racing the version check.
      const [current] = await tx
        .select({
          name: roles.name,
          isAdministrator: roles.isAdministrator,
          version: roles.version,
        })
        .from(roles)
        .where(eq(roles.id, input.id))
        .for("update");
      if (!current || current.isAdministrator) {
        return { kind: "stale_version" };
      }
      if (current.version !== input.version) {
        return { kind: "stale_version" };
      }

      const [nameTaken] = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(sql`lower(${roles.name}) = lower(${input.name}) and ${roles.id} != ${input.id}`)
        .limit(1);
      if (nameTaken) {
        throw new RoleNameTaken();
      }

      const currentPermissionRows = await tx
        .select({ permissionKey: rolePermissions.permissionKey })
        .from(rolePermissions)
        .where(eq(rolePermissions.roleId, input.id));
      const currentPermissionKeys = currentPermissionRows.map((row) => row.permissionKey);
      const currentPermissionSet = new Set(currentPermissionKeys);
      const nextPermissionSet = new Set(input.permissionKeys);
      const sameName = current.name === input.name;
      const samePermissions =
        currentPermissionSet.size === nextPermissionSet.size &&
        [...currentPermissionSet].every((key) => nextPermissionSet.has(key));

      if (sameName && samePermissions) {
        return {
          kind: "applied",
          role: {
            id: input.id,
            name: input.name,
            isAdministrator: false,
            permissionKeys: PERMISSION_KEYS.filter((key) => currentPermissionSet.has(key)),
            userCount: 0,
            version: current.version,
            assignedUsers: [],
          },
        };
      }

      const nextVersion = current.version + 1;
      const nextPermissionKeys = PERMISSION_KEYS.filter((key) => nextPermissionSet.has(key));
      await tx
        .update(roles)
        .set({ name: input.name, version: nextVersion })
        .where(eq(roles.id, input.id));
      changes.note({ entity: "role", entityId: input.id, version: nextVersion, op: "update" });
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, input.id));
      if (input.permissionKeys.length > 0) {
        await tx.insert(rolePermissions).values(
          input.permissionKeys.map((permissionKey) => ({
            roleId: input.id,
            permissionKey,
          })),
        );
      }

      await tx.insert(auditLog).values({
        entity: "role",
        entityId: input.id,
        actorId: input.actorId,
        previousValue: {
          name: current.name,
          permissions: PERMISSION_KEYS.filter((key) => currentPermissionSet.has(key)),
        },
        newValue: { name: input.name, permissions: nextPermissionKeys },
      });

      const previousAccess = { isAdministrator: false, permissionKeys: currentPermissionKeys };
      const nextAccess = { isAdministrator: false, permissionKeys: nextPermissionKeys };
      if (increasesAccess(previousAccess, nextAccess)) {
        const addedPermissionKeys = grantedPermissionKeys(
          currentPermissionKeys,
          nextPermissionKeys,
        );
        for (const holder of await listRoleUsers(tx, input.id)) {
          await openAlert(
            tx,
            {
              kind: "user_access_increased",
              scope: holder.id,
              detail: {
                cause: "role_permissions_added",
                roleName: input.name,
                addedPermissionKeys,
                actorId: input.actorId,
              },
            },
            deps,
          );
        }
      }

      return {
        kind: "applied",
        role: {
          id: input.id,
          name: input.name,
          isAdministrator: false,
          permissionKeys: nextPermissionKeys,
          userCount: 0,
          version: nextVersion,
          assignedUsers: [],
        },
      };
    },
  ).catch((error: unknown): EditRoleOutcome => {
    if (error instanceof RoleNameTaken || isRoleNameUniqueViolation(error)) {
      return { kind: "name_taken" };
    }
    throw error;
  });

  if (outcome.kind !== "applied") {
    return outcome;
  }
  const assignedUsers = await listRoleUsers(db, input.id);
  return {
    kind: "applied",
    role: { ...outcome.role, userCount: assignedUsers.length, assignedUsers },
  };
}

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

      const target = await findEditableRole(options.db, request.params.id);
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
        options.db,
        {
          id: target.id,
          name: parsedBody.name,
          permissionKeys: parsedBody.permissions,
          version: parsedBody.version,
          actorId: openSession.userId,
        },
        { now },
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
