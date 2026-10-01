import { heldPermissionKeys } from "../model/holds-permission.js";
import type { RoleDirectory } from "./role-directory.js";

export interface ListRolesPorts {
  roles: RoleDirectory;
}

export interface RoleSummary {
  id: string;
  name: string | null;
  isAdministrator: boolean;
  permissionKeys: string[];
  userCount: number;
}

export async function listRoles({ roles }: ListRolesPorts): Promise<RoleSummary[]> {
  const listings = await roles.roles();
  return listings.map((role) => ({
    id: role.id,
    name: role.name,
    isAdministrator: role.isAdministrator,
    permissionKeys: heldPermissionKeys({
      isAdministrator: role.isAdministrator,
      permissionKeys: role.storedPermissionKeys,
    }),
    userCount: role.activeHolderCount,
  }));
}
