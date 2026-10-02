export const LOSS_REASONS = [
  "broken_or_spilled",
  "spoiled",
  "portioning_waste",
  "tasting_or_sample",
  "store_consumption",
  "theft",
] as const;

export type LossReason = (typeof LOSS_REASONS)[number];

export const ADJUSTMENT_REASONS = [
  "purchase_correction",
  "supplier_return",
  "batch_correction",
] as const;

export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

export const STOCK_DIRECTIONS = ["add", "subtract"] as const;

export type StockDirection = (typeof STOCK_DIRECTIONS)[number];

export const LOSS_DIRECTION = "subtract" satisfies StockDirection;

export function adjustmentDirections(reason: AdjustmentReason): readonly StockDirection[] {
  return reason === "supplier_return" ? ["subtract"] : STOCK_DIRECTIONS;
}

export function signedDelta(direction: StockDirection, quantity: number): number {
  return direction === "add" ? quantity : -quantity;
}

export function lossDelta(quantity: number): number {
  return signedDelta(LOSS_DIRECTION, quantity);
}
