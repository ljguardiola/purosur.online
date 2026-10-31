import { describe, expect, it } from "vitest";
import { supplierOfferPrice } from "./supplier-offer.js";

const offer = {
  link: { quantity: 6_000, saleUnit: "UNIT" as const, relinkRequired: false },
  priceCents: 6_000,
  pricesIncludeVat: true,
  vatRate: null,
};

describe("supplierOfferPrice", () => {
  it("prices an offer of a current link per sale unit", () => {
    expect(supplierOfferPrice(offer, "UNIT")).toEqual({
      kind: "priced",
      pricePerSaleUnit: { numerator: 1_000n, denominator: 1n },
    });
  });

  it("prices an offer by weight from the quantity in thousandths of a kilogram", () => {
    expect(
      supplierOfferPrice(
        { ...offer, link: { quantity: 500, saleUnit: "KG", relinkRequired: false } },
        "KG",
      ),
    ).toEqual({ kind: "priced", pricePerSaleUnit: { numerator: 12_000n, denominator: 1n } });
  });

  it("leaves unpriced an offer whose link requires linking again", () => {
    expect(
      supplierOfferPrice({ ...offer, link: { ...offer.link, relinkRequired: true } }, "UNIT"),
    ).toEqual({ kind: "unpriced", reason: "link_outdated" });
  });

  it("leaves unpriced an offer whose link is stated in another sale unit than the product", () => {
    expect(supplierOfferPrice(offer, "KG")).toEqual({
      kind: "unpriced",
      reason: "link_outdated",
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
