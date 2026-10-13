import type { CostSource } from "../model/price-cost-reference.js";

export interface ProductCostSource {
  productId: string;
  source: CostSource;
}

export interface PriceCostReader {
  costSourcesOf(locationId: string, productIds: readonly string[]): Promise<ProductCostSource[]>;
  isActiveProduct(productId: string): Promise<boolean>;
}
