import type { Fraction } from "../../shared/index.js";
import { STOCK_QUANTITY_PER_UNIT } from "../../stock/index.js";

export interface RecipeComponentQuantity {
  componentProductId: string;
  quantityPerOutputUnit: number;
}

export type RecommendedUnitPrice =
  | { kind: "recommended"; unitPrice: Fraction }
  | { kind: "missing_prices"; componentProductIds: string[] };

export function recommendedUnitPrice(
  components: readonly RecipeComponentQuantity[],
  currentPrices: ReadonlyMap<string, number>,
): RecommendedUnitPrice {
  const missing: string[] = [];
  let numerator = 0n;
  for (const { componentProductId, quantityPerOutputUnit } of components) {
    const price = currentPrices.get(componentProductId);
    if (price === undefined) {
      missing.push(componentProductId);
    } else {
      numerator += BigInt(price) * BigInt(quantityPerOutputUnit);
    }
  }
  if (missing.length > 0) {
    return { kind: "missing_prices", componentProductIds: missing };
  }
  return {
    kind: "recommended",
    unitPrice: { numerator, denominator: BigInt(STOCK_QUANTITY_PER_UNIT) },
  };
}
