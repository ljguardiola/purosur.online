import type { ProductChoice, ProductChoiceCandidate, ProductChooser } from "../product-chooser.js";

export class FakeProductChooser implements ProductChooser {
  readonly asked: {
    item: { description: string; presentation: string | null };
    candidates: ProductChoiceCandidate[];
  }[] = [];
  answer: ProductChoice | Error = { kind: "none" };

  async choose(
    item: { description: string; presentation: string | null },
    candidates: ProductChoiceCandidate[],
  ): Promise<ProductChoice> {
    this.asked.push({ item, candidates });
    if (this.answer instanceof Error) {
      throw this.answer;
    }
    return this.answer;
  }
}
