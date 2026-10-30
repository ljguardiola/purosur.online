import type { AiCallUsage } from "../ai-call-usage.js";
import type {
  PriceListExtraction,
  PriceListExtractor,
  PriceListSource,
} from "../price-list-extractor.js";

export class FakePriceListExtractor implements PriceListExtractor {
  readonly received: PriceListSource[] = [];
  answer: PriceListExtraction | Error = {
    kind: "extracted",
    listDate: null,
    pricesIncludeVat: null,
    rows: [],
  };
  reportedCalls: AiCallUsage[] = [];
  onExtract: () => Promise<void> = async () => undefined;

  async extract(
    source: PriceListSource,
    onCall: (usage: AiCallUsage) => void,
  ): Promise<PriceListExtraction> {
    this.received.push(source);
    await this.onExtract();
    for (const usage of this.reportedCalls) {
      onCall(usage);
    }
    if (this.answer instanceof Error) {
      throw this.answer;
    }
    return this.answer;
  }
}
