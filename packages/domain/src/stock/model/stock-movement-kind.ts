import { holdsPermission, type PermissionKey, type RoleAccess } from "../../access/index.js";

export const MANUAL_STOCK_MOVEMENT_KINDS = ["loss", "adjustment"] as const;

export type ManualStockMovementKind = (typeof MANUAL_STOCK_MOVEMENT_KINDS)[number];

export type StockMovementKind = ManualStockMovementKind | "count";

const PERMISSION_OF_KIND = {
  loss: "record_stock_losses",
  adjustment: "adjust_stock",
} as const satisfies Record<ManualStockMovementKind, PermissionKey>;

export function manualStockMovementPermission(kind: ManualStockMovementKind): PermissionKey {
  return PERMISSION_OF_KIND[kind];
}

export function visibleManualStockMovementKinds(access: RoleAccess): ManualStockMovementKind[] {
  return MANUAL_STOCK_MOVEMENT_KINDS.filter((kind) =>
    holdsPermission(access, manualStockMovementPermission(kind)),
  );
}
