import type { PermissionCatalogWire } from "@purosur/contracts";
import type { PermissionKey } from "@purosur/domain";

type CatalogArea = PermissionCatalogWire[number];

export type CataloguedPermission = CatalogArea["permissions"][number];

export function permissionsOf(catalog: PermissionCatalogWire): CataloguedPermission[] {
  return catalog.flatMap(({ permissions }) => permissions);
}

export function withRequiredPermissions(
  catalog: PermissionCatalogWire,
  keys: Iterable<PermissionKey>,
): Set<PermissionKey> {
  const selected = new Set(keys);
  for (const { key, requires } of permissionsOf(catalog)) {
    if (selected.has(key)) {
      for (const required of requires) {
        selected.add(required);
      }
    }
  }
  return selected;
}

export function permissionsRequiring(
  catalog: PermissionCatalogWire,
  key: PermissionKey,
  held: Iterable<PermissionKey>,
): PermissionKey[] {
  const heldKeys = new Set(held);
  return permissionsOf(catalog)
    .filter((permission) => heldKeys.has(permission.key) && permission.requires.includes(key))
    .map((permission) => permission.key);
}
