import { describe, expect, it } from "vitest";
import { supplierOfferPrice, supplierOfferToOrder } from "./supplier-offer.js";

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

describe("supplierOfferToOrder", () => {
  const item = (quantity: number, priceCents: number, overrides = {}) => ({
    ...offer,
    link: { ...offer.link, quantity },
    priceCents,
    ...overrides,
  });

  it("takes the item cheapest per sale unit among those priced", () => {
    const dearer = item(1_000, 2_000);
    const cheapest = item(6_000, 9_000);
    const bulk = item(12_000, 30_000);

    expect(supplierOfferToOrder([dearer, cheapest, bulk], "UNIT")).toBe(cheapest);
  });

  it("prefers a priced item to a current one without a comparable price", () => {
    const withoutVatRate = item(1_000, 100, { pricesIncludeVat: false });
    const priced = item(6_000, 9_000);

    expect(supplierOfferToOrder([withoutVatRate, priced], "UNIT")).toBe(priced);
  });

  it("takes a current item without a comparable price over one whose link is outdated", () => {
    const outdated = item(1_000, 100, { link: { ...offer.link, relinkRequired: true } });
    const withoutVatRate = item(6_000, 9_000, { pricesIncludeVat: false });
    const laterWithoutVatRate = item(12_000, 9_000, { pricesIncludeVat: false });

    expect(supplierOfferToOrder([outdated, withoutVatRate, laterWithoutVatRate], "UNIT")).toBe(
      withoutVatRate,
    );
  });

  it("takes none when every item's link is outdated or there is none", () => {
    expect(
      supplierOfferToOrder(
        [item(1_000, 100, { link: { ...offer.link, relinkRequired: true } })],
        "UNIT",
      ),
    ).toBeUndefined();
    expect(supplierOfferToOrder([item(1_000, 100)], "KG")).toBeUndefined();
    expect(supplierOfferToOrder([], "UNIT")).toBeUndefined();
  });
});
