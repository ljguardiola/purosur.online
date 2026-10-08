import { isPermissionKey, PERMISSION_KEYS, type PermissionKey } from "./permission-catalog.js";

export type RequirementMap<Key extends string> = Readonly<Partial<Record<Key, readonly Key[]>>>;

export const PERMISSION_REQUIREMENTS: RequirementMap<PermissionKey> = {
  perform_stock_counts: ["view_stock_balances"],
  adjust_stock: ["view_stock_balances"],
  record_stock_losses: ["view_stock_balances"],
};

export function closeUnderRequirements<Key extends string>(
  requirements: RequirementMap<Key>,
  keys: Iterable<Key>,
): Set<Key> {
  const closed = new Set(keys);
  const pending = [...closed];
  for (let key = pending.pop(); key !== undefined; key = pending.pop()) {
    for (const required of requirements[key] ?? []) {
      if (!closed.has(required)) {
        closed.add(required);
        pending.push(required);
      }
    }
  }
  return closed;
}

export function withRequiredPermissions(keys: Iterable<PermissionKey>): Set<PermissionKey> {
  return closeUnderRequirements(PERMISSION_REQUIREMENTS, keys);
}

export function lacksARequiredPermission(keys: readonly string[]): boolean {
  const known = keys.filter(isPermissionKey);
  return withRequiredPermissions(known).size !== new Set(known).size;
}

export function permissionsRequiring(key: PermissionKey): PermissionKey[] {
  return PERMISSION_KEYS.filter(
    (candidate) => candidate !== key && withRequiredPermissions([candidate]).has(key),
  );
}
