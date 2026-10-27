import type { ExtractedPriceListRow } from "./price-list-extractor.js";

export type StoreCatalogReading =
  | { kind: "read"; rows: ExtractedPriceListRow[] }
  | { kind: "unreadable" };

export interface StoreCatalogs {
  // One row for every product and presentation the kept catalog holds, sold out ones included.
  rows(catalog: Uint8Array): Promise<StoreCatalogReading>;
}
