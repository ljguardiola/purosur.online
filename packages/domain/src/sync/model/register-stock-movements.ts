import type { StockMovementKind } from "../../stock/index.js";

export const REGISTER_STOCK_MOVEMENT_KINDS = [
  "loss",
  "adjustment",
  "count",
  "sale",
  "sale_void",
  "return",
  "exchange_out",
  "receipt",
  "opening_count",
  "opening_count_withdrawal",
  "assembly_out",
  "assembly_in",
  "assembly_void",
] as const satisfies readonly StockMovementKind[];

export type RegisterStockMovementKind = (typeof REGISTER_STOCK_MOVEMENT_KINDS)[number];

export function stockMovementReachesRegisters(kind: StockMovementKind): boolean {
  return kind !== "lot_split";
}
