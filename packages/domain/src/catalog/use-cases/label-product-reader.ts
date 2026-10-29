import type { CatalogNetContent } from "./catalog-store.js";

export interface LabelProduct {
  id: string;
  name: string;
  brandName: string | null;
  netContent: CatalogNetContent | null;
  active: boolean;
  barcodes: string[];
}

export interface LabelProductReader {
  productsForLabels(productIds: readonly string[]): Promise<LabelProduct[]>;
}
