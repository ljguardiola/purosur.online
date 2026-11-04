import { type Fraction, roundHalfUp } from "./rounding.js";

export function marginTenthsOfPercent(price: Fraction, cost: Fraction): number | null {
  if (price.numerator === 0n) {
    return null;
  }
  const scaledPrice = price.numerator * cost.denominator;
  const scaledCost = cost.numerator * price.denominator;
  return roundHalfUp({
    numerator: (scaledPrice - scaledCost) * 1000n,
    denominator: scaledPrice,
  });
}
