import { describe, expect, it } from "vitest";
import { supplierOfferPrice } from "./supplier-offer.js";

const offer = {
  packaging: { active: true, saleUnit: "UNIT" as const, quantityPerPackage: 6_000 },
  priceCents: 6_000,
  pricesIncludeVat: true,
  vatRate: null,
};

describe("supplierOfferPrice", () => {
  it("prices an offer of a buyable packaging per sale unit", () => {
    expect(supplierOfferPrice(offer, "UNIT")).toEqual({
      kind: "priced",
      pricePerSaleUnit: { numerator: 1_000n, denominator: 1n },
    });
  });

  it("leaves unpriced an offer of an inactive packaging", () => {
    expect(
      supplierOfferPrice({ ...offer, packaging: { ...offer.packaging, active: false } }, "UNIT"),
    ).toEqual({ kind: "unpriced", reason: "packaging_not_buyable" });
  });

  it("leaves unpriced an offer of a packaging in another sale unit than the product", () => {
    expect(supplierOfferPrice(offer, "KG")).toEqual({
      kind: "unpriced",
      reason: "packaging_not_buyable",
    });
  });

  it("leaves unpriced an offer excluding VAT whose rate is missing", () => {
    expect(supplierOfferPrice({ ...offer, pricesIncludeVat: false }, "UNIT")).toEqual({
      kind: "unpriced",
      reason: "vat_rate_missing",
    });
  });

  it("adds the VAT rate to an offer excluding it", () => {
    expect(
      supplierOfferPrice({ ...offer, pricesIncludeVat: false, vatRate: 2_100 }, "UNIT"),
    ).toEqual({ kind: "priced", pricePerSaleUnit: { numerator: 1_210n, denominator: 1n } });
  });
});
