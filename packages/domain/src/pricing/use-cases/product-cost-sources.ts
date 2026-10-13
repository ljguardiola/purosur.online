import type { CostSource } from "../model/price-cost-reference.js";
import type { InitialCountCostReader } from "./initial-count-cost-reader.js";
import type { PurchaseCostReader } from "./purchase-cost-reader.js";

export interface ProductCostPorts {
  purchaseCosts: PurchaseCostReader;
  initialCountCosts: InitialCountCostReader;
}

export async function costSourcesByProductId(
  { purchaseCosts, initialCountCosts }: ProductCostPorts,
  locationId: string,
  productIds: readonly string[],
): Promise<Map<string, CostSource[]>> {
  const purchased = await purchaseCosts.purchaseLineCostsOf(locationId, productIds);
  const counted = await initialCountCosts.initialCountCostsOf(locationId, productIds);
  const sources: { productId: string; source: CostSource }[] = [
    ...purchased.map(({ productId, ...line }) => ({
      productId,
      source: { kind: "purchase_line" as const, ...line },
    })),
    ...counted.map(({ productId, ...count }) => ({
      productId,
      source: { kind: "initial_count" as const, ...count },
    })),
  ];
  const byProductId = new Map<string, CostSource[]>();
  for (const { productId, source } of sources) {
    byProductId.set(productId, [...(byProductId.get(productId) ?? []), source]);
  }
  return byProductId;
}
