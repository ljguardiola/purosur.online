import type { PurchaseCostReader, PurchaseLineCost } from "../purchase-cost-reader.js";

export function fakePurchaseCostReader(
  lines: PurchaseLineCost[],
): PurchaseCostReader & { asked: { locationId: string; productIds: string[] }[] } {
  const asked: { locationId: string; productIds: string[] }[] = [];
  return {
    asked,
    purchaseLineCostsOf: (locationId, productIds) => {
      asked.push({ locationId, productIds: [...productIds] });
      return Promise.resolve(lines.filter(({ productId }) => productIds.includes(productId)));
    },
  };
}
