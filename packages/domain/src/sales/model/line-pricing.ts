import type { SoldQuantity } from "../../pricing/index.js";
import { discountedAmount, lineAmount } from "../../pricing/index.js";
import { roundHalfUp } from "../../shared/index.js";
import type { LinePromotion } from "./sale.js";

export interface LineCharge {
  promotionId: string | null;
  discountAmount: number;
  lineTotal: number;
}

export function chargeLine(
  quantity: SoldQuantity,
  unitPrice: number,
  promotions: readonly LinePromotion[],
): LineCharge {
  const listTotal = roundHalfUp(lineAmount(quantity, unitPrice));
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
