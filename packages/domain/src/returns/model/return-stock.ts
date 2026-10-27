import type { SaleUnit } from "../../catalog/index.js";
import { soldStockDelta } from "../../stock/index.js";
import type { ReturnDisposition } from "./return-reasons.js";

export interface ReturnStockMovementPlan {
  kind: "return" | "loss";
  reason: "return_discard" | null;
  delta: number;
}

export function returnStockDelta(saleUnit: SaleUnit, quantity: number): number {
  return -soldStockDelta(
    saleUnit === "KG" ? { saleUnit, thousandths: quantity } : { saleUnit, units: quantity },
  );
}

export function returnStockMovements(
  disposition: ReturnDisposition,
  delta: number,
): ReturnStockMovementPlan[] {
  const back: ReturnStockMovementPlan = { kind: "return", reason: null, delta };
  return disposition === "restock"
    ? [back]
    : [back, { kind: "loss", reason: "return_discard", delta: -delta }];
}
