import type { PricedAiCall } from "../model/ai-cost-report.js";

export interface SupplierPriceListAiCostQuery {
  locationId: string;
  listId: string;
}

export interface SupplierPriceListAiCostReader {
  // Undefined when the branch has no such list.
  callsOfList(query: SupplierPriceListAiCostQuery): Promise<PricedAiCall[] | undefined>;
}
