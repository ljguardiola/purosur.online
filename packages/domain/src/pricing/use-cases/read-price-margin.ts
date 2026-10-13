import { type PriceCostReference, priceCostReference } from "../model/price-cost-reference.js";
import type { PriceCostReader } from "./price-cost-reader.js";

export interface ReadPriceMarginPorts {
  costs: PriceCostReader;
}

export interface ReadPriceMarginInput {
  locationId: string;
  productId: string;
  unitPrice: number;
}

export type ReadPriceMarginOutcome =
  | { kind: "read"; costReference: PriceCostReference | null }
  | { kind: "not_found" };

export async function readPriceMargin(
  { costs }: ReadPriceMarginPorts,
  { locationId, productId, unitPrice }: ReadPriceMarginInput,
): Promise<ReadPriceMarginOutcome> {
  if (!(await costs.isActiveProduct(productId))) {
    return { kind: "not_found" };
  }
  const found = await costs.costSourcesOf(locationId, [productId]);
  return {
    kind: "read",
    costReference: priceCostReference(
      found.map(({ source }) => source),
      unitPrice,
    ),
  };
}
