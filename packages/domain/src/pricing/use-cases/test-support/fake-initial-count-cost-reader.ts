import type { InitialCountCost, InitialCountCostReader } from "../initial-count-cost-reader.js";

export function fakeInitialCountCostReader(
  counts: InitialCountCost[],
): InitialCountCostReader & { asked: { locationId: string; productIds: string[] }[] } {
  const asked: { locationId: string; productIds: string[] }[] = [];
  return {
    asked,
    initialCountCostsOf: (locationId, productIds) => {
      asked.push({ locationId, productIds: [...productIds] });
      return Promise.resolve(counts.filter(({ productId }) => productIds.includes(productId)));
    },
  };
}
