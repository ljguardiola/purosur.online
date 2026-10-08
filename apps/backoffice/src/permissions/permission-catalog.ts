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
