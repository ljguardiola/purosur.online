import type { RoleAccess } from "./access-increase.js";
import { PERMISSION_CATALOG, type PermissionKey } from "./permission-catalog.js";

export function uncoveredRegisterPermissions(
  heldPermissionKeys: readonly string[],
): PermissionKey[] {
  const held = new Set(heldPermissionKeys);
  return PERMISSION_CATALOG.filter(
    (definition) => definition.registerMarker !== "none" && !held.has(definition.key),
  ).map((definition) => definition.key);
}

export function holdsARegisterPermission(access: RoleAccess): boolean {
  if (access.isAdministrator) {
    return true;
  }
  const held = new Set(access.permissionKeys);
  return PERMISSION_CATALOG.some(
    (definition) => definition.registerMarker !== "none" && held.has(definition.key),
  );
}
