import type { AssemblyBatchCost, AssemblyBatchCostReader } from "../assembly-batch-cost-reader.js";

export function fakeAssemblyBatchCostReader(
  batches: AssemblyBatchCost[],
): AssemblyBatchCostReader & { asked: { locationId: string; productIds: string[] }[] } {
  const asked: { locationId: string; productIds: string[] }[] = [];
  return {
    asked,
    batchLotCostsOf: (locationId, productIds) => {
      asked.push({ locationId, productIds: [...productIds] });
      return Promise.resolve(batches.filter(({ productId }) => productIds.includes(productId)));
    },
  };
}
