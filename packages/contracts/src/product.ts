export const PRODUCT_NAME_MAX_LENGTH = 100;

/**
 * Counts Unicode code points rather than UTF-16 units, so a single emoji counts once; a composed
 * emoji such as a flag or a family still counts once per code point.
 */
export function productNameLength(name: string): number {
  return Array.from(name).length;
}

export const BARCODE_MAX_LENGTH = 64;

/** Same code-point counting as `productNameLength`, kept separate since the two limits differ. */
export function barcodeLength(code: string): number {
  return Array.from(code).length;
}

export const PRODUCT_BARCODES_MAX_COUNT = 20;

export const LABELS_MAX_COUNT_PER_PRODUCT = 999;

// 100 sheets of 24 labels each, generous headroom over a real print run.
export const LABELS_MAX_TOTAL_COUNT = 2400;

export type NetContentUnit = "G" | "KG" | "ML" | "L" | "UNIT";

export const NET_CONTENT_UNITS: readonly NetContentUnit[] = ["G", "KG", "ML", "L", "UNIT"];

export function isNetContentUnit(value: unknown): value is NetContentUnit {
  return typeof value === "string" && (NET_CONTENT_UNITS as readonly string[]).includes(value);
}

// Generous headroom over any package a store would realistically stock, while still bounding the
// column instead of leaving it unlimited.
export const NET_CONTENT_QUANTITY_MAX = 100_000;

export const NET_CONTENT_QUANTITY_MAX_DECIMALS = 3;

/**
 * True for a positive, finite quantity of at most `NET_CONTENT_QUANTITY_MAX_DECIMALS` decimal
 * places, capped at `NET_CONTENT_QUANTITY_MAX`. Scaling and rounding (rather than formatting the
 * number as a string) avoids floating-point noise from the multiplication itself, the same trick a
 * money amount would use if this repository stored one this way.
 */
export function isValidNetContentQuantity(quantity: number): boolean {
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > NET_CONTENT_QUANTITY_MAX) {
    return false;
  }
  const scale = 10 ** NET_CONTENT_QUANTITY_MAX_DECIMALS;
  return Math.round(quantity * scale) / scale === quantity;
}
