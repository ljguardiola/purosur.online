import type { CurrentPriceReader } from "../current-price-reader.js";
import type { CurrentPrice } from "../pricing-store.js";

export function fakeCurrentPriceReader(
  currentPrices: Map<string, CurrentPrice>,
): CurrentPriceReader {
  return {
    currentUnitPrices: () =>
      Promise.resolve(
        new Map([...currentPrices].map(([productId, { unitPrice }]) => [productId, unitPrice])),
      ),
    currentPriceOf: (_locationId, productId) =>
      Promise.resolve(currentPrices.get(productId) ?? null),
  };
}
