import type { RoleAccess } from "./access-increase.js";
import type { PERMISSION_CATALOG, PermissionKey } from "./permission-catalog.js";

export type AuthorizablePermissionKey = Extract<
  (typeof PERMISSION_CATALOG)[number],
  { registerMarker: "register_with_another_persons_pin" }
>["key"];

export function holdsPermission(access: RoleAccess, key: PermissionKey): boolean {
  return access.isAdministrator || access.permissionKeys.includes(key);
}
