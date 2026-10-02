import type { Fraction } from "../../shared/index.js";
import type { DiscountBenefit } from "./discount-benefit.js";

export type SoldQuantity =
  | { saleUnit: "UNIT"; units: number }
  | { saleUnit: "KG"; thousandths: number };

export function lineAmount(quantity: SoldQuantity, unitPrice: number): Fraction {
  return quantity.saleUnit === "UNIT"
    ? { numerator: BigInt(quantity.units) * BigInt(unitPrice), denominator: 1n }
    : { numerator: BigInt(quantity.thousandths) * BigInt(unitPrice), denominator: 1000n };
}

export function discountedAmount(
  quantity: SoldQuantity,
  unitPrice: number,
  benefit: DiscountBenefit,
): Fraction {
  const amount = lineAmount(quantity, unitPrice);
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
