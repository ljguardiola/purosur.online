import { type PriceCostReference, priceCostReference } from "../model/price-cost-reference.js";
import type { ActiveProductReader } from "./active-product-reader.js";
import { costSourcesByProductId, type ProductCostPorts } from "./product-cost-sources.js";

export interface ReadPriceMarginPorts extends ProductCostPorts {
  products: ActiveProductReader;
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
  ports: ReadPriceMarginPorts,
  { locationId, productId, unitPrice }: ReadPriceMarginInput,
): Promise<ReadPriceMarginOutcome> {
  if (!(await ports.products.isActiveProduct(productId))) {
    return { kind: "not_found" };
  }
  const sources = await costSourcesByProductId(ports, locationId, [productId]);
  return {
    kind: "read",
    costReference: priceCostReference(sources.get(productId) ?? [], unitPrice),
  };
}
