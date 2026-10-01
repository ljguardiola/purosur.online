import { PERMISSION_KEYS } from "../model/permission-catalog.js";
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

export function permissionKeysInCatalogOrder(storedPermissionKeys: string[]): string[] {
  const stored = new Set(storedPermissionKeys);
  return PERMISSION_KEYS.filter((key) => stored.has(key));
}

export async function listRoles({ roles }: ListRolesPorts): Promise<RoleSummary[]> {
  const listings = await roles.roles();
  return listings.map((role) => ({
    id: role.id,
    name: role.name,
    isAdministrator: role.isAdministrator,
    permissionKeys: role.isAdministrator
      ? [...PERMISSION_KEYS]
      : permissionKeysInCatalogOrder(role.storedPermissionKeys),
    userCount: role.activeHolderCount,
  }));
}
