import type { NetContentUnit, SaleUnit } from "../../catalog/index.js";
import type { OnAiCall } from "./ai-call-usage.js";

export interface ProductChoiceCandidate {
  id: string;
  name: string;
  brandName: string | null;
  netContent: { quantity: number; unit: NetContentUnit } | null;
  saleUnit: SaleUnit;
}

export interface ProductChoiceItem {
  description: string;
  presentation: string | null;
  // The presentations the same list states for the same description.
  otherPresentations: string[];
}

export type ProductChoice =
  // The quantity of the chosen product's sale unit the item brings, in thousandths; null when the AI cannot tell.
  | { kind: "chosen"; productId: string; quantity: number | null }
  | { kind: "none" }
  | { kind: "unavailable" };

// What the AI service receives is the item's description, its presentation and the other presentations the list states for
// it, and the candidates' ids, names, brands, net contents and sale units: no supplier, branch or person.
export interface ProductChooser {
  choose(
    item: ProductChoiceItem,
    candidates: ProductChoiceCandidate[],
    // Reports each call to the AI service as it ends, even when the choice then throws.
    onCall: OnAiCall,
  ): Promise<ProductChoice>;
}
