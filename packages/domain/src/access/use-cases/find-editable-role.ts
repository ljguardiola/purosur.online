import { permissionKeysInCatalogOrder } from "./list-roles.js";
import type { RoleDirectory } from "./role-directory.js";

export interface FindEditableRolePorts {
  roles: RoleDirectory;
}

export interface FindEditableRoleInput {
  roleId: string;
}

export interface EditableRole {
  id: string;
  name: string | null;
  version: number;
  permissionKeys: string[];
}

export async function findEditableRole(
  { roles }: FindEditableRolePorts,
  input: FindEditableRoleInput,
): Promise<EditableRole | undefined> {
  const role = await roles.role(input.roleId);
  if (!role || role.isAdministrator) {
    return undefined;
  }
  return {
    id: role.id,
    name: role.name,
    version: role.version,
    permissionKeys: permissionKeysInCatalogOrder(role.storedPermissionKeys),
  };
}
