import type { RoleDirectory, RoleHolder } from "./role-directory.js";

export interface ListRoleHoldersPorts {
  roles: RoleDirectory;
}

export interface ListRoleHoldersInput {
  roleId: string;
}

export function listRoleHolders(
  { roles }: ListRoleHoldersPorts,
  input: ListRoleHoldersInput,
): Promise<RoleHolder[]> {
  return roles.activeRoleHolders(input.roleId);
}
