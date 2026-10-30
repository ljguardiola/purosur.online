import { type AiCost, aiCostOf } from "../model/ai-cost-report.js";
import type { SupplierPriceListAiCostReader } from "./supplier-price-list-ai-cost-reader.js";

export interface FindSupplierPriceListAiCostInput {
  listId: string;
}

export type FindSupplierPriceListAiCostOutcome =
  | { kind: "not_found" }
  | { kind: "found"; cost: AiCost; recordedFromStart: boolean };

export async function findSupplierPriceListAiCost(
  { reader }: { reader: SupplierPriceListAiCostReader },
  { listId }: FindSupplierPriceListAiCostInput,
): Promise<FindSupplierPriceListAiCostOutcome> {
  const list = await reader.callsOfList(listId);
  return list === undefined
    ? { kind: "not_found" }
    : { kind: "found", cost: aiCostOf(list.calls), recordedFromStart: list.recordedFromStart };
}
