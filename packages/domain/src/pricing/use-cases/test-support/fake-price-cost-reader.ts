import type { PriceCostReader, ProductCostSource } from "../price-cost-reader.js";

export function fakePriceCostReader(
  sources: ProductCostSource[],
  activeProductIds: string[] = [],
): PriceCostReader & { askedProductIds: string[][] } {
  const askedProductIds: string[][] = [];
  return {
    askedProductIds,
    costSourcesOf: (_locationId, productIds) => {
      askedProductIds.push([...productIds]);
      return Promise.resolve(sources.filter(({ productId }) => productIds.includes(productId)));
    },
    isActiveProduct: (productId) => Promise.resolve(activeProductIds.includes(productId)),
  };
}
