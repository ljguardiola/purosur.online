import { describe, expect, it } from "vitest";
import {
  BARCODE_MAX_LENGTH,
  barcodeLength,
  LABELS_MAX_COUNT_PER_PRODUCT,
  LABELS_MAX_TOTAL_COUNT,
  PRODUCT_NAME_MAX_LENGTH,
  productNameLength,
} from "./product";

describe("PRODUCT_NAME_MAX_LENGTH", () => {
  it("allows product names of up to 100 characters", () => {
    expect(PRODUCT_NAME_MAX_LENGTH).toBe(100);
  });
});

describe("productNameLength", () => {
  it("counts each letter as one character", () => {
    expect(productNameLength("Semillas")).toBe(8);
  });

  it("counts each emoji as one character", () => {
    expect(productNameLength("🌱".repeat(3))).toBe(3);
    expect(productNameLength("Café 🌱")).toBe(6);
  });
});

describe("LABELS_MAX_COUNT_PER_PRODUCT", () => {
  it("allows up to 999 labels of one product in a single sheet request", () => {
    expect(LABELS_MAX_COUNT_PER_PRODUCT).toBe(999);
  });
});

describe("LABELS_MAX_TOTAL_COUNT", () => {
  it("allows up to 2400 labels, 100 sheets of 24, in a single sheet request", () => {
    expect(LABELS_MAX_TOTAL_COUNT).toBe(2400);
  });
});

describe("BARCODE_MAX_LENGTH", () => {
  it("allows barcodes of up to 64 characters", () => {
    expect(BARCODE_MAX_LENGTH).toBe(64);
  });
});

describe("barcodeLength", () => {
  it("counts each character as one", () => {
    expect(barcodeLength("7791234567890")).toBe(13);
  });
});
