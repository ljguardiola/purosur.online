import { describe, expect, it } from "vitest";
import {
  SUPPLIER_ITEM_QUANTITY_UNIT_OPTIONS,
  supplierItemQuantityFieldKind,
  supplierItemQuantityInputOf,
  supplierItemQuantityMessage,
  supplierItemQuantityOf,
} from "./supplier-item-quantity";

describe("supplierItemQuantityOf", () => {
  it("reads whole units of a product sold by the unit in thousandths", () => {
    expect(supplierItemQuantityOf({ quantity: "12", saleUnit: "UNIT", quantityUnit: "KG" })).toBe(
      12_000,
    );
  });

  it("refuses a fraction of a unit", () => {
    expect(supplierItemQuantityOf({ quantity: "1,5", saleUnit: "UNIT", quantityUnit: "KG" })).toBe(
      Number.NaN,
    );
  });

  it("reads kilos with decimals of a product sold by weight", () => {
    expect(supplierItemQuantityOf({ quantity: "2,5", saleUnit: "KG", quantityUnit: "KG" })).toBe(
      2_500,
    );
  });

  it("reads grams of a product sold by weight as thousandths of a kilo", () => {
    expect(supplierItemQuantityOf({ quantity: "500", saleUnit: "KG", quantityUnit: "G" })).toBe(
      500,
    );
  });

  it("refuses grams with decimals and text that is no number", () => {
    expect(supplierItemQuantityOf({ quantity: "500,5", saleUnit: "KG", quantityUnit: "G" })).toBe(
      Number.NaN,
    );
    expect(supplierItemQuantityOf({ quantity: "diez", saleUnit: "UNIT", quantityUnit: "KG" })).toBe(
      Number.NaN,
    );
  });

  it("reads the unit chosen only for a product sold by weight", () => {
    expect(supplierItemQuantityOf({ quantity: "12", saleUnit: "UNIT", quantityUnit: "G" })).toBe(
      12_000,
    );
  });
});

describe("supplierItemQuantityInputOf", () => {
  it("writes units as whole units", () => {
    expect(supplierItemQuantityInputOf(12_000, "UNIT")).toEqual({
      quantity: "12",
      quantityUnit: "KG",
    });
  });

  it("writes a kilo or more in kilos with only the decimals it needs", () => {
    expect(supplierItemQuantityInputOf(2_500, "KG")).toEqual({
      quantity: "2,5",
      quantityUnit: "KG",
    });
    expect(supplierItemQuantityInputOf(10_000, "KG")).toEqual({
      quantity: "10",
      quantityUnit: "KG",
    });
  });

  it("writes less than a kilo in grams", () => {
    expect(supplierItemQuantityInputOf(500, "KG")).toEqual({ quantity: "500", quantityUnit: "G" });
  });
});

describe("supplierItemQuantityFieldKind", () => {
  it("suffixes units with u and takes no decimals", () => {
    expect(supplierItemQuantityFieldKind("UNIT", "KG")).toEqual({
      kind: "plain-text",
      suffix: "u",
    });
  });

  it("suffixes the unit chosen for a product sold by weight, with decimals only for kilos", () => {
    expect(supplierItemQuantityFieldKind("KG", "KG")).toEqual({
      kind: "plain-text",
      suffix: "kg",
      inputMode: "decimal",
    });
    expect(supplierItemQuantityFieldKind("KG", "G")).toEqual({
      kind: "plain-text",
      suffix: "g",
      inputMode: "numeric",
    });
  });
});

describe("supplierItemQuantityMessage", () => {
  it("asks for the quantity, then explains how to write it in the unit chosen", () => {
    expect(
      supplierItemQuantityMessage({ quantity: " ", saleUnit: "UNIT", quantityUnit: "KG" }),
    ).toBe("Ingresá la cantidad que trae el ítem.");
    expect(
      supplierItemQuantityMessage({ quantity: "1,5", saleUnit: "UNIT", quantityUnit: "KG" }),
    ).toBe("Escribí una cantidad entera de unidades, por ejemplo 16.");
    expect(supplierItemQuantityMessage({ quantity: "x", saleUnit: "KG", quantityUnit: "KG" })).toBe(
      "Escribí los kilos con coma para los decimales, hasta 3, por ejemplo 12,150.",
    );
    expect(supplierItemQuantityMessage({ quantity: "x", saleUnit: "KG", quantityUnit: "G" })).toBe(
      "Escribí los gramos como un número entero, por ejemplo 500.",
    );
  });
});

describe("SUPPLIER_ITEM_QUANTITY_UNIT_OPTIONS", () => {
  it("offers kilos and grams", () => {
    expect(SUPPLIER_ITEM_QUANTITY_UNIT_OPTIONS).toEqual([
      { value: "KG", label: "kg" },
      { value: "G", label: "g" },
    ]);
  });
});
