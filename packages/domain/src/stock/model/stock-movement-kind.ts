import { type Capability, grantsCapability, type RoleAccess } from "../../access/index.js";
import {
  ADJUSTMENT_REASONS,
  type AdjustmentReason,
  adjustmentDirections,
  LOSS_DIRECTION,
  LOSS_REASONS,
  type LossReason,
  type StockDirection,
} from "./stock-movement-reason.js";

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

type ManualStockMovementReason =
  | { kind: "loss"; reason: LossReason; directions: readonly StockDirection[] }
  | { kind: "adjustment"; reason: AdjustmentReason; directions: readonly StockDirection[] };

export function manualStockMovementReasons(
  kind: ManualStockMovementKind,
): ManualStockMovementReason[] {
  return kind === "loss"
    ? LOSS_REASONS.map((reason) => ({ kind, reason, directions: [LOSS_DIRECTION] }))
    : ADJUSTMENT_REASONS.map((reason) => ({
        kind,
        reason,
        directions: adjustmentDirections(reason),
      }));
}
