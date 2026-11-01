import type { SaleUnit } from "../../catalog/index.js";
import { soldStockDelta } from "../../stock/index.js";
import type { ReturnDisposition, ReturnResolution } from "./return-reasons.js";

export interface ReturnStockMovementPlan {
  kind: "return" | "loss" | "exchange_out";
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
  resolution: ReturnResolution,
): ReturnStockMovementPlan[] {
  const back: ReturnStockMovementPlan = { kind: "return", reason: null, delta };
  const replacement: ReturnStockMovementPlan[] =
    resolution === "exchange" ? [{ kind: "exchange_out", reason: null, delta: -delta }] : [];
  return disposition === "restock"
    ? [back, ...replacement]
    : [back, { kind: "loss", reason: "return_discard", delta: -delta }, ...replacement];
}
