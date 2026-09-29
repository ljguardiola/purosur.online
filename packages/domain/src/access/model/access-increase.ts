export interface RoleAccess {
  isAdministrator: boolean;
  permissionKeys: readonly string[];
}

export function grantedPermissionKeys<Key extends string>(
  before: readonly string[],
  after: readonly Key[],
): Key[] {
  const previous = new Set(before);
  return after.filter((key) => !previous.has(key));
}

export function increasesAccess(before: RoleAccess, after: RoleAccess): boolean {
  if (before.isAdministrator) {
    return false;
  }
  if (after.isAdministrator) {
    return true;
  }
  return grantedPermissionKeys(before.permissionKeys, after.permissionKeys).length > 0;
}
