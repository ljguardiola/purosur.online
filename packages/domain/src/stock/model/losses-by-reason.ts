import type { SaleUnit } from "../../catalog/index.js";
import { compareSpanishText } from "../../shared/index.js";
import { RECORDED_LOSS_REASONS, type RecordedLossReason } from "./stock-movement-reason.js";

export interface LossRecord {
  reason: RecordedLossReason;
  product: { id: string; name: string; saleUnit: SaleUnit };
  quantity: number;
}

export interface LostProduct {
  id: string;
  name: string;
  saleUnit: SaleUnit;
  quantity: number;
  lossCount: number;
}

export interface ReasonLosses {
  reason: RecordedLossReason;
  lossCount: number;
  products: LostProduct[];
}

function compareProducts(a: LostProduct, b: LostProduct): number {
  return compareSpanishText(a.name, b.name) || compareSpanishText(a.id, b.id);
}

export function lossesByReason(records: readonly LossRecord[]): ReasonLosses[] {
  return RECORDED_LOSS_REASONS.flatMap((reason) => {
    const products = new Map<string, LostProduct>();
    let lossCount = 0;
    for (const record of records) {
      if (record.reason !== reason) {
        continue;
      }
      lossCount += 1;
      const { id, name, saleUnit } = record.product;
      const lost = products.get(id) ?? { id, name, saleUnit, quantity: 0, lossCount: 0 };
      lost.quantity += record.quantity;
      lost.lossCount += 1;
      products.set(id, lost);
    }
    return lossCount === 0
      ? []
      : [{ reason, lossCount, products: [...products.values()].sort(compareProducts) }];
  });
}
