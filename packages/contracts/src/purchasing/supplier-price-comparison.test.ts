import { describe, expect, it } from "vitest";
import { supplierPriceComparisonSchema } from "./supplier-price-comparison.js";

const offer = {
  supplier: { id: "s-1", name: "Distribuidora Sur" },
  packagingName: "Caja x 10",
  quantityPerPackage: 10_000,
  priceCents: 12_000,
  pricePerSaleUnit: { numerator: "1105", denominator: "1" },
  listDate: "2026-03-01",
  cheapest: true,
};
const comparison = {
  products: [
    { id: "p-1", name: "Yerba", categoryName: "Almacén", saleUnit: "UNIT", offers: [offer] },
    { id: "p-2", name: "Azúcar", categoryName: "Almacén", saleUnit: "KG", offers: [] },
  ],
};

describe("supplierPriceComparisonSchema", () => {
  it("accepts products with offers and products without any", () => {
    expect(supplierPriceComparisonSchema.safeParse(comparison).data).toEqual(comparison);
  });

  it("accepts a comparison without products", () => {
    expect(supplierPriceComparisonSchema.safeParse({ products: [] }).data).toEqual({
      products: [],
    });
  });

  it.each(Object.keys(offer))("requires %s in an offer", (field) => {
    const { [field as keyof typeof offer]: _omitted, ...rest } = offer;
    const incomplete = {
      products: [{ ...comparison.products[0], offers: [rest] }],
    };

    expect(supplierPriceComparisonSchema.safeParse(incomplete).success).toBe(false);
  });

  it.each(["id", "name", "categoryName", "saleUnit", "offers"])(
    "requires %s in a product",
    (field) => {
      const { [field as keyof (typeof comparison.products)[0]]: _omitted, ...rest } =
        comparison.products[0] ?? {};

      expect(supplierPriceComparisonSchema.safeParse({ products: [rest] }).success).toBe(false);
    },
  );

  it.each([
    ["priceCents", 1.5],
    ["quantityPerPackage", "10"],
    ["cheapest", "yes"],
    ["pricePerSaleUnit", { numerator: "1", denominator: "0" }],
    ["pricePerSaleUnit", null],
    ["listDate", null],
  ])("refuses an offer with %s as %j", (field, value) => {
    const bad = {
      products: [{ ...comparison.products[0], offers: [{ ...offer, [field]: value }] }],
    };

    expect(supplierPriceComparisonSchema.safeParse(bad).success).toBe(false);
  });

  it("refuses a product sold by an unknown unit", () => {
    const bad = { products: [{ ...comparison.products[0], saleUnit: "BOX" }] };

    expect(supplierPriceComparisonSchema.safeParse(bad).success).toBe(false);
  });
});
