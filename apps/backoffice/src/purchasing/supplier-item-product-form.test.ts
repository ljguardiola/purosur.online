import { describe, expect, it } from "vitest";
import { EMPTY_PRODUCT_FORM, PRODUCT_MESSAGES, productRequestFrom } from "../platform/product-form";
import {
  SUPPLIER_ITEM_PRODUCT_MESSAGES,
  type SupplierItemProductFormValues,
  supplierItemProductFormValuesOf,
  supplierItemProductRequestFrom,
} from "./supplier-item-product-form";
import { EXTRACTED_ROWS } from "./test-support/supplier-price-lists";

const [, unlinkedWithoutPresentation, nutRow] = EXTRACTED_ROWS as [
  (typeof EXTRACTED_ROWS)[number],
  (typeof EXTRACTED_ROWS)[number],
  (typeof EXTRACTED_ROWS)[number],
];

const FILLED: SupplierItemProductFormValues = {
  name: "Aceite de almendras",
  categoryId: "category-1",
  brandId: "",
  saleUnit: "UNIT",
  netContent: { quantity: "", unit: "G" },
  barcodes: { codes: ["7790001000029"], scan: "" },
  tagIds: [],
  quantity: "10",
  quantityUnit: "KG",
  vatRate: "",
  version: 3,
};

describe("supplierItemProductFormValuesOf", () => {
  it("starts as a new product does, with the item's description as the name and its barcode, and no quantity typed", () => {
    expect(supplierItemProductFormValuesOf(nutRow, 3)).toEqual({
      ...EMPTY_PRODUCT_FORM,
      name: nutRow.description,
      barcodes: { codes: ["7790001000029"], scan: "" },
      quantity: "",
      quantityUnit: "KG",
      vatRate: "",
      version: 3,
    });
  });

  it("leaves the barcodes empty when the item has none", () => {
    expect(supplierItemProductFormValuesOf(unlinkedWithoutPresentation, 3).barcodes).toEqual({
      codes: [],
      scan: "",
    });
  });
});

describe("supplierItemProductRequestFrom", () => {
  it("builds the request with the quantity in the stock's units", () => {
    expect(supplierItemProductRequestFrom(FILLED, false)).toEqual({
      version: 3,
      name: "Aceite de almendras",
      saleUnit: "UNIT",
      categoryId: "category-1",
      brandId: null,
      barcodes: ["7790001000029"],
      tagIds: [],
      netContent: null,
      quantity: 10_000,
      vatRate: null,
    });
  });

  it("builds the product's part of the request as a new product does", () => {
    const filled = {
      ...FILLED,
      brandId: "brand-1",
      tagIds: ["tag-1"],
      netContent: { quantity: "125", unit: "ML" as const },
    };

    expect(supplierItemProductRequestFrom(filled, false)).toMatchObject(productRequestFrom(filled));
  });

  it("reads the quantity in kilos when the product is sold by weight", () => {
    const request = supplierItemProductRequestFrom(
      { ...FILLED, saleUnit: "KG", quantity: "12,5" },
      false,
    );

    expect(request.quantity).toBe(12_500);
  });

  it("reads the quantity in grams when the product is sold by weight and grams are chosen", () => {
    const request = supplierItemProductRequestFrom(
      { ...FILLED, saleUnit: "KG", quantity: "500", quantityUnit: "G" },
      false,
    );

    expect(request.quantity).toBe(500);
  });

  it("includes the code still typed in the scan input", () => {
    const request = supplierItemProductRequestFrom(
      { ...FILLED, barcodes: { codes: [], scan: " 7790001000036 " } },
      false,
    );

    expect(request.barcodes).toEqual(["7790001000036"]);
  });

  it("sends the chosen VAT rate only when the list's prices exclude VAT", () => {
    expect(supplierItemProductRequestFrom({ ...FILLED, vatRate: "2100" }, true).vatRate).toBe(2100);
    expect(
      supplierItemProductRequestFrom({ ...FILLED, vatRate: "2100" }, false).vatRate,
    ).toBeNull();
  });

  it("sends an unreadable quantity as not a number so the contract refuses it", () => {
    expect(
      supplierItemProductRequestFrom({ ...FILLED, quantity: "diez" }, false).quantity,
    ).toBeNaN();
  });

  it("sends no category as an empty id so the contract refuses it", () => {
    expect(supplierItemProductRequestFrom({ ...FILLED, categoryId: null }, false).categoryId).toBe(
      "",
    );
  });
});

describe("SUPPLIER_ITEM_PRODUCT_MESSAGES", () => {
  it("asks for the quantity, then explains how to write it for the sale unit", () => {
    expect(SUPPLIER_ITEM_PRODUCT_MESSAGES.quantity({ ...FILLED, quantity: "" })).toBe(
      "Ingresá la cantidad que trae el ítem.",
    );
    expect(SUPPLIER_ITEM_PRODUCT_MESSAGES.quantity({ ...FILLED, quantity: "1,5" })).toBe(
      "Escribí una cantidad entera de unidades, por ejemplo 16.",
    );
    expect(
      SUPPLIER_ITEM_PRODUCT_MESSAGES.quantity({ ...FILLED, saleUnit: "KG", quantity: "x" }),
    ).toBe("Escribí los kilos con coma para los decimales, hasta 3, por ejemplo 12,150.");
    expect(
      SUPPLIER_ITEM_PRODUCT_MESSAGES.quantity({
        ...FILLED,
        saleUnit: "KG",
        quantity: "x",
        quantityUnit: "G",
      }),
    ).toBe("Escribí los gramos como un número entero, por ejemplo 500.");
  });

  it("asks for the VAT rate", () => {
    expect(SUPPLIER_ITEM_PRODUCT_MESSAGES.vatRate()).toBe("Elegí el IVA del ítem.");
  });

  it("words the product's fields as a new product does", () => {
    expect(SUPPLIER_ITEM_PRODUCT_MESSAGES.name({ ...FILLED, name: " " })).toBe(
      PRODUCT_MESSAGES.name({ ...FILLED, name: " " }),
    );
    expect(SUPPLIER_ITEM_PRODUCT_MESSAGES.saleUnit()).toBe(PRODUCT_MESSAGES.saleUnit());
    expect(SUPPLIER_ITEM_PRODUCT_MESSAGES.brandId()).toBe(PRODUCT_MESSAGES.brandId());
  });
});
