import type { Fraction } from "./rounding.js";
import { roundHalfUp } from "./rounding.js";
import type { LinePromotion } from "./sale.js";

export type LineQuantity =
  | { saleUnit: "UNIT"; units: number }
  | { saleUnit: "KG"; thousandths: number };

export interface LineCharge {
  promotionId: string | null;
  discountAmount: number;
  lineTotal: number;
}

export function lineAmount(quantity: LineQuantity, unitPrice: number): Fraction {
  return quantity.saleUnit === "UNIT"
    ? { numerator: BigInt(quantity.units) * BigInt(unitPrice), denominator: 1n }
    : { numerator: BigInt(quantity.thousandths) * BigInt(unitPrice), denominator: 1000n };
}

export function chargeLine(
  quantity: LineQuantity,
  unitPrice: number,
  promotions: readonly LinePromotion[],
): LineCharge {
  const amount = lineAmount(quantity, unitPrice);
  const listTotal = roundHalfUp(amount);
  let best: LineCharge = { promotionId: null, discountAmount: 0, lineTotal: listTotal };
  for (const promotion of [...promotions].sort((a, b) => a.id.localeCompare(b.id))) {
    const lineTotal = roundHalfUp(promotedAmount(quantity, unitPrice, amount, promotion));
    const discountAmount = listTotal - lineTotal;
    if (discountAmount > best.discountAmount) {
      best = { promotionId: promotion.id, discountAmount, lineTotal };
    }
  }
  return best;
}

function promotedAmount(
  quantity: LineQuantity,
  unitPrice: number,
  amount: Fraction,
  { benefit }: LinePromotion,
): Fraction {
  if (benefit.kind === "PERCENT_OFF") {
    return {
      numerator: amount.numerator * BigInt(100 - benefit.percent),
      denominator: amount.denominator * 100n,
    };
  }
  if (quantity.saleUnit === "KG") {
    return amount;
  }
  const buy = BigInt(benefit.buyQty);
  const units = BigInt(quantity.units);
  const chargedUnits = (units / buy) * BigInt(benefit.payQty) + (units % buy);
  return { numerator: chargedUnits * BigInt(unitPrice), denominator: 1n };
}
