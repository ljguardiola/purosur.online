import { describe, expect, it } from "vitest";
import { orderSuggestionSchema } from "./order-suggestion.js";

const offer = {
  supplier: { id: "s-1", name: "Distribuidora Sur" },
  packageQuantity: 12_000,
  saleUnit: "UNIT",
  priceCents: 12_000,
  pricePerSaleUnit: { numerator: "1000", denominator: "1" },
  listDate: "2026-10-01",
  cheapest: true,
  packages: 4,
  quantity: 48_000,
};
const unpricedOffer = {
  supplier: { id: "s-2", name: "Mayorista Norte" },
  packageQuantity: 5_000,
  saleUnit: "UNIT",
  priceCents: 9_000,
  listDate: "2026-09-01",
  reason: "vat_rate_missing",
  order: { packages: 10, quantity: 50_000 },
};
const supplier = { id: "s-3", name: "Granos del Valle" };
const line = {
  id: "p-1",
  name: "Yerba",
  brandName: "Piragüé",
  netContent: { quantity: 500, unit: "G" },
  categoryName: "Almacén",
  saleUnit: "UNIT",
  effectiveDays: 10,
  cappedByExpiry: true,
  soldQuantity: 120_000,
  stock: 12_000,
  neededQuantity: 48_000,
  offers: [offer],
  unpricedOffers: [unpricedOffer],
};

describe("orderSuggestionSchema", () => {
  it("accepts a line with offers and one without any", () => {
    const withoutOffers = {
      suppliers: [supplier],
      lines: [
        line,
        { ...line, id: "p-2", brandName: null, netContent: null, offers: [], unpricedOffers: [] },
      ],
    };

    expect(orderSuggestionSchema.safeParse(withoutOffers).data).toEqual(withoutOffers);
  });

  it("accepts a suggestion without lines or suppliers", () => {
    expect(orderSuggestionSchema.safeParse({ suppliers: [], lines: [] }).data).toEqual({
      suppliers: [],
      lines: [],
    });
  });

  it.each(["suppliers", "lines"])("requires %s", (field) => {
    const { [field as "suppliers" | "lines"]: _omitted, ...rest } = {
      suppliers: [supplier],
      lines: [line],
    };

    expect(orderSuggestionSchema.safeParse(rest).success).toBe(false);
  });

  it.each(Object.keys(supplier))("requires %s in a supplier", (field) => {
    const { [field as keyof typeof supplier]: _omitted, ...rest } = supplier;

    expect(orderSuggestionSchema.safeParse({ suppliers: [rest], lines: [] }).success).toBe(false);
  });

  it("accepts an offer with no price whose link states no usable package", () => {
    const withoutPackages = {
      suppliers: [],
      lines: [
        { ...line, unpricedOffers: [{ ...unpricedOffer, reason: "link_outdated", order: null }] },
      ],
    };

    expect(orderSuggestionSchema.safeParse(withoutPackages).data).toEqual(withoutPackages);
  });

  it.each([
    ["packageQuantity", 1.5],
    ["order", { packages: 1.5, quantity: 1_000 }],
    ["order", { packages: 1, quantity: 0.5 }],
    ["order", { quantity: 1_000 }],
    ["order", { packages: 1 }],
  ])("refuses an offer with no price with %s as %j", (field, value) => {
    expect(
      orderSuggestionSchema.safeParse({
        suppliers: [],
        lines: [{ ...line, unpricedOffers: [{ ...unpricedOffer, [field]: value }] }],
      }).success,
    ).toBe(false);
  });

  it.each(Object.keys(line))("requires %s in a line", (field) => {
    const { [field as keyof typeof line]: _omitted, ...rest } = line;

    expect(orderSuggestionSchema.safeParse({ suppliers: [], lines: [rest] }).success).toBe(false);
  });

  it.each([
    ["effectiveDays", 10.5],
    ["effectiveDays", "10"],
    ["cappedByExpiry", "yes"],
  ])("refuses a line with %s as %j", (field, value) => {
    expect(
      orderSuggestionSchema.safeParse({ suppliers: [], lines: [{ ...line, [field]: value }] })
        .success,
    ).toBe(false);
  });

  it.each(Object.keys(offer))("requires %s in an offer", (field) => {
    const { [field as keyof typeof offer]: _omitted, ...rest } = offer;

    expect(
      orderSuggestionSchema.safeParse({ suppliers: [], lines: [{ ...line, offers: [rest] }] })
        .success,
    ).toBe(false);
  });

  it.each(Object.keys(unpricedOffer))("requires %s in an offer with no price", (field) => {
    const { [field as keyof typeof unpricedOffer]: _omitted, ...rest } = unpricedOffer;

    expect(
      orderSuggestionSchema.safeParse({
        suppliers: [],
        lines: [{ ...line, unpricedOffers: [rest] }],
      }).success,
    ).toBe(false);
  });

  it.each([
    ["packages", 1.5],
    ["packageQuantity", "12"],
    ["quantity", 1.5],
    ["saleUnit", "BOX"],
    ["cheapest", "yes"],
    ["pricePerSaleUnit", { numerator: "1", denominator: "0" }],
  ])("refuses an offer with %s as %j", (field, value) => {
    expect(
      orderSuggestionSchema.safeParse({
        suppliers: [],
        lines: [{ ...line, offers: [{ ...offer, [field]: value }] }],
      }).success,
    ).toBe(false);
  });

  it.each(["vat_rate_missing", "link_outdated"])(
    "accepts an offer with no price because of %s",
    (reason) => {
      const withReason = {
        suppliers: [],
        lines: [{ ...line, unpricedOffers: [{ ...unpricedOffer, reason }] }],
      };

      expect(orderSuggestionSchema.safeParse(withReason).data).toEqual(withReason);
    },
  );

  it.each(["", "other", null])("refuses an offer with no price because of %j", (reason) => {
    expect(
      orderSuggestionSchema.safeParse({
        suppliers: [],
        lines: [{ ...line, unpricedOffers: [{ ...unpricedOffer, reason }] }],
      }).success,
    ).toBe(false);
  });

  it.each([
    ["soldQuantity", "5"],
    ["stock", 0.5],
    ["neededQuantity", null],
    ["saleUnit", "BOX"],
    ["brandName", 5],
    ["netContent", { quantity: 500, unit: "BOX" }],
  ])("refuses a line with %s as %j", (field, value) => {
    expect(
      orderSuggestionSchema.safeParse({ suppliers: [], lines: [{ ...line, [field]: value }] })
        .success,
    ).toBe(false);
  });

  it("keeps a negative stock", () => {
    const negative = { suppliers: [], lines: [{ ...line, stock: -3_000 }] };

    expect(orderSuggestionSchema.safeParse(negative).data).toEqual(negative);
  });
});
