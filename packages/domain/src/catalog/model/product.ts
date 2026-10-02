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

export type BarcodeListProblem = "too_many" | "too_long" | "whitespace" | "repeated";

export function barcodeListProblem(codes: readonly string[]): BarcodeListProblem | undefined {
  if (codes.length > PRODUCT_BARCODES_MAX_COUNT) {
    return "too_many";
  }
  const seen = new Set<string>();
  for (const code of codes) {
    if (isBarcodeTooLong(code)) {
      return "too_long";
    }
    if (/\s/.test(code)) {
      return "whitespace";
    }
    if (seen.has(code)) {
      return "repeated";
    }
    seen.add(code);
  }
  return undefined;
}

export const SALE_UNITS = ["UNIT", "KG"] as const;

export type SaleUnit = (typeof SALE_UNITS)[number];

export type NetContentUnit = "G" | "KG" | "ML" | "L" | "UNIT";

export const NET_CONTENT_UNITS: readonly NetContentUnit[] = ["G", "KG", "ML", "L", "UNIT"];

export function isNetContentUnit(value: unknown): value is NetContentUnit {
  return NET_CONTENT_UNITS.some((unit) => unit === value);
}

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
