import type { NetContentUnit } from "../../catalog/index.js";

export interface ProductChoiceCandidate {
  id: string;
  name: string;
  brandName: string | null;
  netContent: { quantity: number; unit: NetContentUnit } | null;
}

export type ProductChoice =
  | { kind: "chosen"; productId: string }
  | { kind: "none" }
  | { kind: "unavailable" };

// What the AI service receives is the item's text and the candidates' names, brands and net contents: no supplier, branch
// or person.
export interface ProductChooser {
  choose(
    item: { description: string; presentation: string | null },
    candidates: ProductChoiceCandidate[],
  ): Promise<ProductChoice>;
}
