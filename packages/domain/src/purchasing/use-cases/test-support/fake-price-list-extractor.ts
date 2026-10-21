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
  onExtract: () => Promise<void> = async () => undefined;

  async extract(source: PriceListSource): Promise<PriceListExtraction> {
    this.received.push(source);
    await this.onExtract();
    if (this.answer instanceof Error) {
      throw this.answer;
    }
    return this.answer;
  }
}
