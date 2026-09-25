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
