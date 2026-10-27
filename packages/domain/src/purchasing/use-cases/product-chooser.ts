export interface ProductChoiceCandidate {
  id: string;
  name: string;
}

export type ProductChoice =
  | { kind: "chosen"; productId: string }
  | { kind: "none" }
  | { kind: "unavailable" };

// What the AI service receives is the item's text and the candidates' names: no supplier, branch
// or person.
export interface ProductChooser {
  choose(
    item: { description: string; presentation: string | null },
    candidates: ProductChoiceCandidate[],
  ): Promise<ProductChoice>;
}
