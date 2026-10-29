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
const unpricedOffer = {
  supplier: { id: "s-2", name: "Mayorista Norte" },
  packagingName: "Bolsa x 5",
  priceCents: 9_000,
  listDate: "2026-02-01",
  reason: "vat_rate_missing",
};
const comparison = {
  products: [
    {
      id: "p-1",
      name: "Yerba",
      brandName: "Piragüé",
      netContent: { quantity: 500, unit: "G" },
      categoryName: "Almacén",
      saleUnit: "UNIT",
      offers: [offer],
      unpricedOffers: [unpricedOffer],
    },
    {
      id: "p-2",
      name: "Azúcar",
      brandName: null,
      netContent: null,
      categoryName: "Almacén",
      saleUnit: "KG",
      offers: [],
      unpricedOffers: [],
    },
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

  it.each(["vat_rate_missing", "packaging_not_buyable"])(
    "accepts an offer with no price per sale unit because of %s",
    (reason) => {
      const withReason = {
        products: [{ ...comparison.products[0], unpricedOffers: [{ ...unpricedOffer, reason }] }],
      };

      expect(supplierPriceComparisonSchema.safeParse(withReason).data).toEqual(withReason);
    },
  );

  it.each(["", "other", null])(
    "refuses an offer with no price per sale unit because of %j",
    (reason) => {
      const bad = {
        products: [{ ...comparison.products[0], unpricedOffers: [{ ...unpricedOffer, reason }] }],
      };

      expect(supplierPriceComparisonSchema.safeParse(bad).success).toBe(false);
    },
  );

  it.each(Object.keys(unpricedOffer))(
    "requires %s in an offer with no price per sale unit",
    (field) => {
      const { [field as keyof typeof unpricedOffer]: _omitted, ...rest } = unpricedOffer;
      const incomplete = {
        products: [{ ...comparison.products[0], unpricedOffers: [rest] }],
      };

      expect(supplierPriceComparisonSchema.safeParse(incomplete).success).toBe(false);
    },
  );

  it.each([
    "id",
    "name",
    "brandName",
    "netContent",
    "categoryName",
    "saleUnit",
    "offers",
    "unpricedOffers",
  ])("requires %s in a product", (field) => {
    const { [field as keyof (typeof comparison.products)[0]]: _omitted, ...rest } =
      comparison.products[0] ?? {};

    expect(supplierPriceComparisonSchema.safeParse({ products: [rest] }).success).toBe(false);
  });

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

  it.each([
    ["brandName", 5],
    ["netContent", { quantity: 500, unit: "BOX" }],
    ["netContent", { quantity: 0, unit: "G" }],
  ])("refuses a product with %s as %j", (field, value) => {
    const bad = { products: [{ ...comparison.products[0], [field]: value }] };

    expect(supplierPriceComparisonSchema.safeParse(bad).success).toBe(false);
  });

  it("refuses a product sold by an unknown unit", () => {
    const bad = { products: [{ ...comparison.products[0], saleUnit: "BOX" }] };

    expect(supplierPriceComparisonSchema.safeParse(bad).success).toBe(false);
  });
});
