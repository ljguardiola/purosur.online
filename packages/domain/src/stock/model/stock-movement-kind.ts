import { type Capability, grantsCapability, type RoleAccess } from "../../access/index.js";

export const MANUAL_STOCK_MOVEMENT_KINDS = ["loss", "adjustment"] as const;

export type ManualStockMovementKind = (typeof MANUAL_STOCK_MOVEMENT_KINDS)[number];

export type StockMovementKind = ManualStockMovementKind | "count";

const CAPABILITY_OF_KIND = {
  loss: "stock_losses",
  adjustment: "stock_adjustments",
} as const satisfies Record<ManualStockMovementKind, Capability>;

export function manualStockMovementCapability(kind: ManualStockMovementKind): Capability {
  return CAPABILITY_OF_KIND[kind];
}

export function visibleManualStockMovementKinds(access: RoleAccess): ManualStockMovementKind[] {
  return MANUAL_STOCK_MOVEMENT_KINDS.filter((kind) =>
    grantsCapability(access, manualStockMovementCapability(kind)),
  );
}
