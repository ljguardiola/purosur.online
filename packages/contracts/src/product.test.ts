import { describe, expect, it } from "vitest";
import {
  BARCODE_MAX_LENGTH,
  barcodeLength,
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
