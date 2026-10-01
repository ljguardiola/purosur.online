import { grantedPermissionKeys, increasesAccess } from "../model/access-increase.js";
import { isRoleEditable } from "../model/role-editability.js";
import { permissionKeysInCatalogOrder } from "./list-roles.js";
import type { Clock } from "./pin-code-store.js";
import type { RoleDirectory, RoleHolder } from "./role-directory.js";
import { RoleNameConflict, type RoleStore } from "./role-store.js";

export interface EditRolePorts {
  store: RoleStore;
  roles: RoleDirectory;
  clock: Clock;
}

export interface EditRoleInput {
  id: string;
  name: string;
  permissionKeys: string[];
  version: number;
  actorId: string;
}

export interface EditedRole {
  id: string;
  name: string;
  isAdministrator: false;
  permissionKeys: string[];
  userCount: number;
  version: number;
  assignedUsers: RoleHolder[];
}

export type EditRoleOutcome =
  | { kind: "stale_version" }
  | { kind: "name_taken" }
  | { kind: "applied"; role: EditedRole };

type EditedState = { kind: "edited"; permissionKeys: string[]; version: number };

export async function editRole(
  { store, roles, clock }: EditRolePorts,
  input: EditRoleInput,
): Promise<EditRoleOutcome> {
  let result: EditedState | EditRoleOutcome;
  try {
    result = await store.transaction<EditedState | EditRoleOutcome>(async (tx) => {
      // Locking the role row makes a concurrent edit of the same role wait instead of racing the
      // version check.
      const locked = await tx.lockRole(input.id);
      if (
        locked.kind === "not_found" ||
        !isRoleEditable(locked.role) ||
        locked.role.version !== input.version
      ) {
        return { kind: "stale_version" };
      }
      const { name: currentName, version } = locked.role;

      if (await tx.roleNameTaken(input.name, input.id)) {
        return { kind: "name_taken" };
      }

      const currentPermissionKeys = await tx.storedPermissionKeys(input.id);
      const currentInCatalogOrder = permissionKeysInCatalogOrder(currentPermissionKeys);
      const nextPermissionKeys = permissionKeysInCatalogOrder(input.permissionKeys);
      const currentSet = new Set(currentPermissionKeys);
      const nextSet = new Set(input.permissionKeys);
      const samePermissions =
        currentSet.size === nextSet.size && [...currentSet].every((key) => nextSet.has(key));
      if (currentName === input.name && samePermissions) {
        return { kind: "edited", permissionKeys: currentInCatalogOrder, version };
      }

      const nextVersion = version + 1;
      await tx.rewriteRole(input.id, {
        name: input.name,
        version: nextVersion,
        permissionKeys: input.permissionKeys,
      });
      await tx.recordRoleChange({
        roleId: input.id,
        actorId: input.actorId,
        previous: { name: currentName, permissionKeys: currentInCatalogOrder },
        next: { name: input.name, permissionKeys: nextPermissionKeys },
      });

      const before = { isAdministrator: false, permissionKeys: currentPermissionKeys };
      const after = { isAdministrator: false, permissionKeys: nextPermissionKeys };
      if (increasesAccess(before, after)) {
        const addedPermissionKeys = grantedPermissionKeys(
          currentPermissionKeys,
          nextPermissionKeys,
        );
        for (const holder of await tx.activeRoleHolders(input.id)) {
          await tx.openAccessIncreasedAlert({
            holderId: holder.id,
            roleName: input.name,
            addedPermissionKeys,
            actorId: input.actorId,
            openedAt: clock.now(),
          });
        }
      }

      return { kind: "edited", permissionKeys: nextPermissionKeys, version: nextVersion };
    });
  } catch (error) {
    if (!(error instanceof RoleNameConflict)) {
      throw error;
    }
    return { kind: "name_taken" };
  }

  if (result.kind !== "edited") {
    return result;
  }
  const assignedUsers = await roles.activeRoleHolders(input.id);
  return {
    kind: "applied",
    role: {
      id: input.id,
      name: input.name,
      isAdministrator: false,
      permissionKeys: result.permissionKeys,
      userCount: assignedUsers.length,
      version: result.version,
      assignedUsers,
    },
  };
}
