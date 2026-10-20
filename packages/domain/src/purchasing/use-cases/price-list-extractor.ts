// What the AI service receives is the source and nothing else: no supplier, branch or person.
export type PriceListSource = { kind: "pdf"; bytes: Uint8Array };

export interface ExtractedPriceListRow {
  description: string;
  code: string | null;
  presentation: string | null;
  priceCents: number | null;
  page: number | null;
}

export type PriceListExtraction =
  | { kind: "extracted"; listDate: string | null; rows: ExtractedPriceListRow[] }
  | { kind: "unreadable" }
  | { kind: "unavailable" };

export interface PriceListExtractor {
  extract(source: PriceListSource): Promise<PriceListExtraction>;
}
