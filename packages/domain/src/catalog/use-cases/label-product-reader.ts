export interface LabelProduct {
  id: string;
  name: string;
  active: boolean;
  barcodes: string[];
}

export interface LabelProductReader {
  productsForLabels(productIds: readonly string[]): Promise<LabelProduct[]>;
}
