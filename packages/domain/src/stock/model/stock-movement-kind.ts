export const MANUAL_STOCK_MOVEMENT_KINDS = ["loss", "adjustment"] as const;

export type ManualStockMovementKind = (typeof MANUAL_STOCK_MOVEMENT_KINDS)[number];

export type StockMovementKind = ManualStockMovementKind | "count";
