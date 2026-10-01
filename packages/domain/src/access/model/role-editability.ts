import { heldPermissionKeys } from "./holds-permission.js";
import type { PermissionKey } from "./permission-catalog.js";

export interface EditableRoleFacts {
  id: string;
  name: string | null;
  version: number;
  storedPermissionKeys: readonly string[];
}

export interface EditableRoleDetail<Holder> {
  id: string;
  name: string | null;
  isAdministrator: false;
  permissionKeys: PermissionKey[];
  userCount: number;
  version: number;
  assignedUsers: Holder[];
}

export function isRoleEditable(role: { isAdministrator: boolean }): boolean {
  return !role.isAdministrator;
}

export function editableRoleDetail<Holder>(
  role: EditableRoleFacts,
  activeHolders: Holder[],
): EditableRoleDetail<Holder> {
  return {
    id: role.id,
    name: role.name,
    isAdministrator: false,
    permissionKeys: heldPermissionKeys({
      isAdministrator: false,
      permissionKeys: role.storedPermissionKeys,
    }),
    userCount: activeHolders.length,
    version: role.version,
    assignedUsers: activeHolders,
  };
}
