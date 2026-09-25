import {
  BARCODE_MAX_LENGTH as SHARED_BARCODE_MAX_LENGTH,
  PRODUCT_BARCODES_MAX_COUNT as SHARED_PRODUCT_BARCODES_MAX_COUNT,
  PRODUCT_NAME_MAX_LENGTH as SHARED_PRODUCT_NAME_MAX_LENGTH,
  barcodeLength as sharedBarcodeLength,
  productNameLength as sharedProductNameLength,
} from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import {
  BARCODE_MAX_LENGTH,
  barcodeLength,
  PRODUCT_BARCODES_MAX_COUNT,
  PRODUCT_NAME_MAX_LENGTH,
  productNameLength,
  readBarcodes,
  readCategoryId,
  readProductName,
  readSaleUnit,
  validateProductFields,
} from "./product-validation.js";

describe("readProductName", () => {
  it("reads a trimmed name from the request body", () => {
    expect(readProductName({ name: "  Maceta 20cm  " })).toBe("Maceta 20cm");
  });

  it("reads undefined when the name is missing, not a string, or blank after trimming", () => {
    expect(readProductName({})).toBeUndefined();
    expect(readProductName({ name: 42 })).toBeUndefined();
    expect(readProductName({ name: "   " })).toBeUndefined();
  });
});

describe("readCategoryId", () => {
  it("reads the category id from the request body", () => {
    expect(readCategoryId({ categoryId: "abc" })).toBe("abc");
  });

  it("reads undefined when missing or not a string", () => {
    expect(readCategoryId({})).toBeUndefined();
    expect(readCategoryId({ categoryId: 42 })).toBeUndefined();
  });
});

describe("readSaleUnit", () => {
  it("reads UNIT or KG from the request body", () => {
    expect(readSaleUnit({ saleUnit: "UNIT" })).toBe("UNIT");
    expect(readSaleUnit({ saleUnit: "KG" })).toBe("KG");
  });

  it("reads undefined for anything else", () => {
    expect(readSaleUnit({})).toBeUndefined();
    expect(readSaleUnit({ saleUnit: "unit" })).toBeUndefined();
    expect(readSaleUnit({ saleUnit: "LITER" })).toBeUndefined();
  });
});

describe("readBarcodes", () => {
  it("reads trimmed codes from the request body", () => {
    expect(readBarcodes({ barcodes: [" 111 ", "222"] })).toEqual(["111", "222"]);
  });

  it("reads undefined when missing, not an array, or empty", () => {
    expect(readBarcodes({})).toBeUndefined();
    expect(readBarcodes({ barcodes: "111" })).toBeUndefined();
    expect(readBarcodes({ barcodes: [] })).toBeUndefined();
  });

  it("reads undefined when any entry is not a non-blank string", () => {
    expect(readBarcodes({ barcodes: ["111", 222] })).toBeUndefined();
    expect(readBarcodes({ barcodes: ["111", "   "] })).toBeUndefined();
  });
});

describe("validateProductFields", () => {
  it("accepts a fully valid set of fields", () => {
    expect(
      validateProductFields({
        name: "Maceta",
        categoryId: "cat-1",
        saleUnit: "UNIT",
        barcodes: ["111", "222"],
      }),
    ).toBeUndefined();
  });

  it("rejects a missing name", () => {
    expect(
      validateProductFields({
        name: undefined,
        categoryId: "cat-1",
        saleUnit: "UNIT",
        barcodes: ["111"],
      }),
    ).toMatchObject({ field: "name" });
  });

  it("rejects a name longer than 100 characters", () => {
    expect(
      validateProductFields({
        name: "a".repeat(101),
        categoryId: "cat-1",
        saleUnit: "UNIT",
        barcodes: ["111"],
      }),
    ).toMatchObject({ field: "name" });
  });

  it("rejects a missing categoryId", () => {
    expect(
      validateProductFields({
        name: "Maceta",
        categoryId: undefined,
        saleUnit: "UNIT",
        barcodes: ["111"],
      }),
    ).toMatchObject({ field: "categoryId" });
  });

  it("rejects a missing saleUnit", () => {
    expect(
      validateProductFields({
        name: "Maceta",
        categoryId: "cat-1",
        saleUnit: undefined,
        barcodes: ["111"],
      }),
    ).toMatchObject({ field: "saleUnit" });
  });

  it("rejects missing barcodes", () => {
    expect(
      validateProductFields({
        name: "Maceta",
        categoryId: "cat-1",
        saleUnit: "UNIT",
        barcodes: undefined,
      }),
    ).toMatchObject({ field: "barcodes" });
  });

  it("rejects a barcode longer than 64 characters", () => {
    expect(
      validateProductFields({
        name: "Maceta",
        categoryId: "cat-1",
        saleUnit: "UNIT",
        barcodes: ["a".repeat(65)],
      }),
    ).toMatchObject({ field: "barcodes" });
  });

  it("accepts up to 20 barcodes and rejects a 21st", () => {
    const codes = Array.from({ length: 21 }, (_, index) => `code-${index}`);
    const fields = { name: "Maceta", categoryId: "cat-1", saleUnit: "UNIT" } as const;

    expect(validateProductFields({ ...fields, barcodes: codes.slice(0, 20) })).toBeUndefined();
    expect(validateProductFields({ ...fields, barcodes: codes })).toMatchObject({
      field: "barcodes",
    });
  });

  it("rejects a barcode with whitespace inside it", () => {
    expect(
      validateProductFields({
        name: "Maceta",
        categoryId: "cat-1",
        saleUnit: "UNIT",
        barcodes: ["111 222"],
      }),
    ).toMatchObject({ field: "barcodes" });
  });

  it("rejects a repeated barcode inside the same request", () => {
    expect(
      validateProductFields({
        name: "Maceta",
        categoryId: "cat-1",
        saleUnit: "UNIT",
        barcodes: ["111", "111"],
      }),
    ).toMatchObject({ field: "barcodes" });
  });
});

describe("the cloud's local product limits", () => {
  it("match the shared limits", () => {
    expect(PRODUCT_NAME_MAX_LENGTH).toBe(SHARED_PRODUCT_NAME_MAX_LENGTH);
    expect(BARCODE_MAX_LENGTH).toBe(SHARED_BARCODE_MAX_LENGTH);
    expect(PRODUCT_BARCODES_MAX_COUNT).toBe(SHARED_PRODUCT_BARCODES_MAX_COUNT);
  });

  it("count length the same way the shared contract does", () => {
    for (const value of ["Maceta", "🌱".repeat(3), "Café 🌱 orgánico"]) {
      expect(productNameLength(value)).toBe(sharedProductNameLength(value));
      expect(barcodeLength(value)).toBe(sharedBarcodeLength(value));
    }
  });
});
