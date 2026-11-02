import type { ProductBrandAndNetContent, SaleUnit } from "../../catalog/index.js";
import { compareCodeUnits, compareSpanishText } from "../../shared/index.js";
import type { StockMovementKind } from "./stock-movement-kind.js";
import {
  RECORDED_LOSS_REASONS,
  REPORTED_LOSS_REASONS,
  type ReportedLossReason,
} from "./stock-movement-reason.js";

export const LOSS_REPORT_MOVEMENT_KINDS = ["loss"] as const satisfies readonly StockMovementKind[];

export function reportedLossReason(movement: {
  kind: string;
  reason: string | null;
  exchanged: boolean;
}): ReportedLossReason | null {
  if (movement.kind !== "loss") {
    return null;
  }
  const recorded = RECORDED_LOSS_REASONS.find((reason) => reason === movement.reason) ?? null;
  return recorded === "return_discard" && movement.exchanged ? "defective_exchange" : recorded;
}

export interface LossRecord {
  reason: ReportedLossReason;
  product: ProductBrandAndNetContent & { id: string; name: string; saleUnit: SaleUnit };
  quantity: number;
}

export interface LostProduct extends ProductBrandAndNetContent {
  id: string;
  name: string;
  saleUnit: SaleUnit;
  quantity: number;
  lossCount: number;
}

export interface ReasonLosses {
  reason: ReportedLossReason;
  lossCount: number;
  products: LostProduct[];
}

function compareProducts(a: LostProduct, b: LostProduct): number {
  return compareSpanishText(a.name, b.name) || compareCodeUnits(a.id, b.id);
}

export function lossesByReason(records: readonly LossRecord[]): ReasonLosses[] {
  return REPORTED_LOSS_REASONS.flatMap((reason) => {
    const products = new Map<string, LostProduct>();
    let lossCount = 0;
    for (const record of records) {
      if (record.reason !== reason) {
        continue;
      }
      lossCount += 1;
      const { id, name, brandName, netContent, saleUnit } = record.product;
      const lost = products.get(id) ?? {
        id,
        name,
        brandName,
        netContent,
        saleUnit,
        quantity: 0,
        lossCount: 0,
      };
      lost.quantity += record.quantity;
      lost.lossCount += 1;
      products.set(id, lost);
    }
    return lossCount === 0
      ? []
      : [{ reason, lossCount, products: [...products.values()].sort(compareProducts) }];
  });
}
