import { type AiCost, aiCostOf } from "../model/ai-cost-report.js";
import type { SupplierPriceListAiCostReader } from "./supplier-price-list-ai-cost-reader.js";

export interface FindSupplierPriceListAiCostInput {
  locationId: string;
  listId: string;
}

export type FindSupplierPriceListAiCostOutcome =
  | { kind: "not_found" }
  | { kind: "found"; cost: AiCost };

export async function findSupplierPriceListAiCost(
  { reader }: { reader: SupplierPriceListAiCostReader },
  input: FindSupplierPriceListAiCostInput,
): Promise<FindSupplierPriceListAiCostOutcome> {
  const calls = await reader.callsOfList(input);
  return calls === undefined ? { kind: "not_found" } : { kind: "found", cost: aiCostOf(calls) };
}
