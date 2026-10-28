import { compareFractions, type Fraction } from "./rounding.js";

// The earliest offer wins a tie.
export function cheapestOffer<T extends { pricePerSaleUnit: Fraction }>(
  offers: readonly T[],
): T | undefined {
  let cheapest: T | undefined;
  for (const offer of offers) {
    if (
      cheapest === undefined ||
      compareFractions(offer.pricePerSaleUnit, cheapest.pricePerSaleUnit) < 0
    ) {
      cheapest = offer;
    }
  }
  return cheapest;
}
