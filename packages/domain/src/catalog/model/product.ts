import { codePointLength } from "../../shared/index.js";

export const PRODUCT_NAME_MAX_LENGTH = 100;

export function productNameLength(name: string): number {
  return codePointLength(name);
}

export function isProductNameTooLong(name: string): boolean {
  return productNameLength(name) > PRODUCT_NAME_MAX_LENGTH;
}

export const BARCODE_MAX_LENGTH = 64;

export function barcodeLength(code: string): number {
  return codePointLength(code);
}

export function isBarcodeTooLong(code: string): boolean {
  return barcodeLength(code) > BARCODE_MAX_LENGTH;
}

export const PRODUCT_BARCODES_MAX_COUNT = 20;

export const LABELS_MAX_COUNT_PER_PRODUCT = 999;

const LABEL_SHEETS_MAX = 100;
const LABELS_PER_SHEET = 24;
export const LABELS_MAX_TOTAL_COUNT = LABEL_SHEETS_MAX * LABELS_PER_SHEET;

export type SaleUnit = "UNIT" | "KG";

export type NetContentUnit = "G" | "KG" | "ML" | "L" | "UNIT";

export const NET_CONTENT_UNITS: readonly NetContentUnit[] = ["G", "KG", "ML", "L", "UNIT"];

export const NET_CONTENT_QUANTITY_MAX = 100_000;

export const NET_CONTENT_QUANTITY_MAX_DECIMALS = 3;

// Rounds after scaling because floating-point multiplication can undershoot
// (1.005 * 1000 is 1004.9999999999999).
export function isValidNetContentQuantity(quantity: number): boolean {
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > NET_CONTENT_QUANTITY_MAX) {
    return false;
  }
  const scale = 10 ** NET_CONTENT_QUANTITY_MAX_DECIMALS;
  return Math.round(quantity * scale) / scale === quantity;
}
