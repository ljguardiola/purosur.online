import type { RoleAccess } from "./access-increase.js";
import { PERMISSION_CATALOG, type PermissionKey } from "./permission-catalog.js";

export type AuthorizablePermissionKey = Extract<
  (typeof PERMISSION_CATALOG)[number],
  { registerMarker: "register_with_another_persons_pin" }
>["key"];

export function holdsPermission(access: RoleAccess, key: PermissionKey): boolean {
  return access.isAdministrator || access.permissionKeys.includes(key);
}

const AUTHORIZABLE_PERMISSION_KEYS: ReadonlySet<unknown> = new Set(
  PERMISSION_CATALOG.filter(
    (definition) => definition.registerMarker === "register_with_another_persons_pin",
  ).map((definition) => definition.key),
);

export function isAuthorizablePermissionKey(value: unknown): value is AuthorizablePermissionKey {
  return AUTHORIZABLE_PERMISSION_KEYS.has(value);
}
