import { describe, expect, it } from "vitest";
import {
  BARCODE_MAX_LENGTH,
  barcodeLength,
  isValidNetContentQuantity,
  LABELS_MAX_COUNT_PER_PRODUCT,
  LABELS_MAX_TOTAL_COUNT,
  NET_CONTENT_QUANTITY_MAX,
  NET_CONTENT_UNITS,
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

describe("NET_CONTENT_UNITS", () => {
  it("lists grams, kilograms, millilitres, litres, and units", () => {
    expect(NET_CONTENT_UNITS).toEqual(["G", "KG", "ML", "L", "UNIT"]);
  });
});

describe("isValidNetContentQuantity", () => {
  it("accepts a positive quantity with up to 3 decimals", () => {
    expect(isValidNetContentQuantity(1)).toBe(true);
    expect(isValidNetContentQuantity(0.5)).toBe(true);
    expect(isValidNetContentQuantity(1.234)).toBe(true);
  });

  it("rejects zero and negative quantities", () => {
    expect(isValidNetContentQuantity(0)).toBe(false);
    expect(isValidNetContentQuantity(-1)).toBe(false);
  });

  it("rejects a quantity with more than 3 decimals", () => {
    expect(isValidNetContentQuantity(1.2345)).toBe(false);
  });

  it("rounds after scaling so floating-point noise from the multiplication doesn't reject a valid quantity, while a sum with real extra precision is still rejected", () => {
    expect(isValidNetContentQuantity(1.005)).toBe(true);
    expect(isValidNetContentQuantity(0.1 + 0.2)).toBe(false);
  });

  it("rejects a quantity beyond the maximum, accepting the maximum itself", () => {
    expect(isValidNetContentQuantity(NET_CONTENT_QUANTITY_MAX)).toBe(true);
    expect(isValidNetContentQuantity(NET_CONTENT_QUANTITY_MAX + 1)).toBe(false);
  });

  it("rejects a non-finite quantity", () => {
    expect(isValidNetContentQuantity(Number.NaN)).toBe(false);
    expect(isValidNetContentQuantity(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
