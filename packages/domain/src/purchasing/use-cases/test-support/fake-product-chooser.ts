import type { AiCallUsage } from "../ai-call-usage.js";
import type { ProductChoice, ProductChoiceCandidate, ProductChooser } from "../product-chooser.js";

export class FakeProductChooser implements ProductChooser {
  readonly asked: {
    item: { description: string; presentation: string | null };
    candidates: ProductChoiceCandidate[];
  }[] = [];
  answer: ProductChoice | Error = { kind: "none" };
  reportedCalls: AiCallUsage[] = [];

  async choose(
    item: { description: string; presentation: string | null },
    candidates: ProductChoiceCandidate[],
    onCall: (usage: AiCallUsage) => void,
  ): Promise<ProductChoice> {
    this.asked.push({ item, candidates });
    for (const usage of this.reportedCalls) {
      onCall(usage);
    }
    if (this.answer instanceof Error) {
      throw this.answer;
    }
    return this.answer;
  }
}
