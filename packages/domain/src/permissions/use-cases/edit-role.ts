import type { Clock } from "../../shared/index.js";
import { grantedPermissionKeys, increasesAccess } from "../model/access-increase.js";
import { heldPermissionKeys } from "../model/holds-permission.js";
import {
  type EditableRoleDetail,
  editableRoleDetail,
  isRoleEditable,
} from "../model/role-editability.js";
import type { RoleHolder } from "./role-directory.js";
import { RoleNameConflict, type RoleStore } from "./role-store.js";

export interface EditRolePorts {
  store: RoleStore;
  clock: Clock;
}

export interface EditRoleInput {
  id: string;
  name: string;
  permissionKeys: string[];
  version: number;
  actorId: string;
}

export type EditRoleOutcome =
  | { kind: "stale_version" }
  | { kind: "name_taken" }
  | { kind: "applied"; role: EditableRoleDetail<RoleHolder> };

export async function editRole(
  { store, clock }: EditRolePorts,
  input: EditRoleInput,
): Promise<EditRoleOutcome> {
  try {
    return await store.transaction<EditRoleOutcome>(async (tx) => {
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
      const currentSet = new Set(currentPermissionKeys);
      const nextSet = new Set(input.permissionKeys);
      const samePermissions =
        currentSet.size === nextSet.size && [...currentSet].every((key) => nextSet.has(key));
      if (currentName === input.name && samePermissions) {
        return {
          kind: "applied",
          role: editableRoleDetail(
            {
              id: input.id,
              name: input.name,
              version,
              storedPermissionKeys: currentPermissionKeys,
            },
            await tx.activeRoleHolders(input.id),
          ),
        };
      }

      const before = { isAdministrator: false, permissionKeys: currentPermissionKeys };
      const after = {
        isAdministrator: false,
        permissionKeys: heldPermissionKeys({
          isAdministrator: false,
          permissionKeys: input.permissionKeys,
        }),
      };
      const nextVersion = version + 1;
      await tx.rewriteRole(input.id, {
        name: input.name,
        version: nextVersion,
        permissionKeys: input.permissionKeys,
      });
      await tx.recordRoleChange({
        roleId: input.id,
        actorId: input.actorId,
        previous: { name: currentName, permissionKeys: heldPermissionKeys(before) },
        next: { name: input.name, permissionKeys: after.permissionKeys },
      });

      const holders = await tx.activeRoleHolders(input.id);
      if (increasesAccess(before, after)) {
        const addedPermissionKeys = grantedPermissionKeys(
          currentPermissionKeys,
          after.permissionKeys,
        );
        for (const holder of holders) {
          await tx.openAccessIncreasedAlert({
            holderId: holder.id,
            roleName: input.name,
            addedPermissionKeys,
            actorId: input.actorId,
            openedAt: clock.now(),
          });
        }
      }

      return {
        kind: "applied",
        role: editableRoleDetail(
          {
            id: input.id,
            name: input.name,
            version: nextVersion,
            storedPermissionKeys: input.permissionKeys,
          },
          holders,
        ),
      };
    });
  } catch (error) {
    if (!(error instanceof RoleNameConflict)) {
      throw error;
    }
    return { kind: "name_taken" };
  }
}
