import type { RoleAccess } from "./access-increase.js";
import type { PermissionKey } from "./permission-catalog.js";

export function holdsPermission(access: RoleAccess, key: PermissionKey): boolean {
  return access.isAdministrator || access.permissionKeys.includes(key);
}
