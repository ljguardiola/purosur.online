import { describe, expect, it } from "vitest";
import {
  readBarcodes,
  readCategoryId,
  readNetContent,
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

describe("readNetContent", () => {
  it("reads a quantity and unit object from the request body", () => {
    expect(readNetContent({ netContent: { quantity: 1.5, unit: "KG" } })).toEqual({
      quantity: 1.5,
      unit: "KG",
    });
  });

  it("reads none when the key is absent or explicitly null", () => {
    expect(readNetContent({})).toBeUndefined();
    expect(readNetContent({ netContent: null })).toBeUndefined();
  });

  it("reads invalid when only one of quantity or unit is present", () => {
    expect(readNetContent({ netContent: { quantity: 1 } })).toBe("invalid");
    expect(readNetContent({ netContent: { unit: "KG" } })).toBe("invalid");
  });

  it("reads invalid when the unit is not a listed unit or the quantity is not a number", () => {
    expect(readNetContent({ netContent: { quantity: 1, unit: "LB" } })).toBe("invalid");
    expect(readNetContent({ netContent: { quantity: "1", unit: "KG" } })).toBe("invalid");
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

  it("accepts a fully valid net content", () => {
    expect(
      validateProductFields({
        name: "Maceta",
        categoryId: "cat-1",
        saleUnit: "UNIT",
        barcodes: ["111"],
        netContent: { quantity: 1.5, unit: "KG" },
      }),
    ).toBeUndefined();
  });

  it("accepts no net content", () => {
    expect(
      validateProductFields({
        name: "Maceta",
        categoryId: "cat-1",
        saleUnit: "UNIT",
        barcodes: ["111"],
        netContent: undefined,
      }),
    ).toBeUndefined();
  });

  it("rejects a malformed net content", () => {
    expect(
      validateProductFields({
        name: "Maceta",
        categoryId: "cat-1",
        saleUnit: "UNIT",
        barcodes: ["111"],
        netContent: "invalid",
      }),
    ).toMatchObject({ field: "netContent" });
  });

  it("rejects a non-positive net content quantity", () => {
    expect(
      validateProductFields({
        name: "Maceta",
        categoryId: "cat-1",
        saleUnit: "UNIT",
        barcodes: ["111"],
        netContent: { quantity: 0, unit: "KG" },
      }),
    ).toMatchObject({ field: "netContentQuantity" });
  });
});
