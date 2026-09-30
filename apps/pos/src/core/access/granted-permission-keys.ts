import { PERMISSION_KEYS, type RoleAccess } from "@purosur/domain";

export function grantedPermissionKeys(access: RoleAccess): string[] {
  return access.isAdministrator ? [...PERMISSION_KEYS] : [...access.permissionKeys];
}
