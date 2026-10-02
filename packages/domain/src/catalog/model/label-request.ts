import { isInternalBarcode } from "./ean13.js";

export const LABELS_MAX_COUNT_PER_PRODUCT = 999;

const LABEL_SHEETS_MAX = 100;
const LABELS_PER_SHEET = 24;
export const LABELS_MAX_TOTAL_COUNT = LABEL_SHEETS_MAX * LABELS_PER_SHEET;

export interface LabelRequestEntry {
  productId: string;
  count: number;
}

export type LabelRequestProblem = "repeated_product" | "too_many_labels";

export function isValidLabelCount(count: number): boolean {
  return Number.isInteger(count) && count >= 1 && count <= LABELS_MAX_COUNT_PER_PRODUCT;
}

export function labelRequestProblem(
  entries: readonly LabelRequestEntry[],
): LabelRequestProblem | undefined {
  const productIds = new Set(entries.map((entry) => entry.productId));
  if (productIds.size !== entries.length) {
    return "repeated_product";
  }
  const total = entries.reduce((sum, entry) => sum + entry.count, 0);
  return total > LABELS_MAX_TOTAL_COUNT ? "too_many_labels" : undefined;
}

export function productLabelCode(product: {
  active: boolean;
  barcodes: readonly string[];
}): string | null {
  if (!product.active) {
    return null;
  }
  return product.barcodes.find(isInternalBarcode) ?? null;
}
