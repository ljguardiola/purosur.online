import type { OnAiCall } from "./ai-call-usage.js";

// What the AI service receives is the source and nothing else: no supplier, branch or person.
export type PriceListSource =
  | { kind: "pdf"; bytes: Uint8Array }
  | { kind: "web_page"; html: Uint8Array };

export interface ExtractedPriceListRow {
  description: string;
  code: string | null;
  presentation: string | null;
  priceCents: number | null;
  page: number | null;
  barcode: string | null;
}

export type PriceListExtraction =
  | {
      kind: "extracted";
      listDate: string | null;
      // What the list says about its prices: true when they include VAT, false when they do not,
      // null when it says nothing.
      pricesIncludeVat: boolean | null;
      rows: ExtractedPriceListRow[];
    }
  | { kind: "unreadable" }
  | { kind: "unavailable" };

export interface PriceListExtractor {
  // Reports each call to the AI service as it ends, even when the extraction then throws.
  extract(source: PriceListSource, onCall: OnAiCall): Promise<PriceListExtraction>;
}
