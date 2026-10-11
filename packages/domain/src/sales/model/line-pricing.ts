import type { SoldQuantity } from "../../pricing/index.js";
import { discountedAmount, lineAmount } from "../../pricing/index.js";
import { roundHalfUp } from "../../shared/index.js";
import type { ManualAdjustmentValue } from "./manual-adjustment.js";
import type { LinePromotion } from "./sale.js";

export interface LineCharge {
  promotionId: string | null;
  discountAmount: number;
  lineTotal: number;
}

export function listLineTotal(quantity: SoldQuantity, unitPrice: number): number {
  return roundHalfUp(lineAmount(quantity, unitPrice));
}

export function chargeLine(
  quantity: SoldQuantity,
  unitPrice: number,
  promotions: readonly LinePromotion[],
  adjustment: ManualAdjustmentValue | null = null,
): LineCharge {
  const listTotal = listLineTotal(quantity, unitPrice);
  if (adjustment !== null) {
    return adjustedCharge(quantity, unitPrice, listTotal, adjustment);
  }
  let best: LineCharge = { promotionId: null, discountAmount: 0, lineTotal: listTotal };
  for (const promotion of inIdentifierOrder(promotions)) {
    const lineTotal = roundHalfUp(discountedAmount(quantity, unitPrice, promotion.benefit));
    const discountAmount = listTotal - lineTotal;
    if (discountAmount > best.discountAmount) {
      best = { promotionId: promotion.id, discountAmount, lineTotal };
    }
  }
  return best;
}

function inIdentifierOrder(promotions: readonly LinePromotion[]): LinePromotion[] {
  const ids = promotions.map(({ id }) => id).sort();
  return [...promotions].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
}

function adjustedCharge(
  quantity: SoldQuantity,
  unitPrice: number,
  listTotal: number,
  adjustment: ManualAdjustmentValue,
): LineCharge {
  switch (adjustment.kind) {
    case "PRICE":
      return {
        promotionId: null,
        discountAmount: 0,
        lineTotal: listLineTotal(quantity, adjustment.unitPrice),
      };
    case "PERCENT": {
      const lineTotal = roundHalfUp(
        discountedAmount(quantity, unitPrice, { kind: "PERCENT_OFF", percent: adjustment.percent }),
      );
      return { promotionId: null, discountAmount: listTotal - lineTotal, lineTotal };
    }
    case "AMOUNT":
      return {
        promotionId: null,
        discountAmount: adjustment.amount,
        lineTotal: listTotal - adjustment.amount,
      };
  }
}
