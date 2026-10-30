import type { PricedAiCall } from "../model/ai-cost-report.js";

export interface SupplierPriceListAiCalls {
  // False for a list whose AI use began before its calls were recorded.
  recordedFromStart: boolean;
  calls: PricedAiCall[];
}

export interface SupplierPriceListAiCostReader {
  // Undefined when there is no such list.
  callsOfList(listId: string): Promise<SupplierPriceListAiCalls | undefined>;
}
