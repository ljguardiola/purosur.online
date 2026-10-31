import type { NetContentUnit, SaleUnit } from "../../catalog/index.js";
import type { OnAiCall } from "./ai-call-usage.js";

export type SupplierItemQuantityReading =
  // In thousandths of the product's sale unit.
  { kind: "read"; quantity: number } | { kind: "none" } | { kind: "unavailable" };

// What the AI service receives is the item's text and the product's sale unit and net content: no supplier, branch or
// person.
export interface SupplierItemQuantityReader {
  read(
    item: { description: string; presentation: string | null; otherPresentations: string[] },
    product: { saleUnit: SaleUnit; netContent: { quantity: number; unit: NetContentUnit } | null },
    // Reports each call to the AI service as it ends, even when the reading then throws.
    onCall: OnAiCall,
  ): Promise<SupplierItemQuantityReading>;
}
