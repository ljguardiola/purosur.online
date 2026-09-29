import { describe, expect, it } from "vitest";
import { priceCategorySchema, priceListSchema, priceProductSchema } from "./price-list.js";

const at = "2026-09-25T12:00:00.000Z";

const priced = {
  id: "product-1",
  name: "Arroz",
  categoryId: "category-1",
  categoryName: "Almacén",
  saleUnit: "KG",
  currentPrice: { id: "price-1", unitPrice: 750000, validFrom: at },
  lastReviewedAt: at,
  pending: false,
};
const unpriced = { ...priced, id: "product-2", currentPrice: null, lastReviewedAt: null };
const almacen = { id: "category-1", name: "Almacén" };
const list = {
  products: [priced, unpriced],
  categories: [almacen],
  pendingCount: 1,
  activeProductCount: 2,
  reviewWindowDays: 30,
};

describe("priceCategorySchema", () => {
  it("accepts an id and a name", () => {
    expect(priceCategorySchema.safeParse(almacen).data).toEqual(almacen);
  });

  it.each(["id", "name"])("requires %s", (field) => {
    const { [field as keyof typeof almacen]: _omitted, ...rest } = almacen;

    expect(priceCategorySchema.safeParse(rest).success).toBe(false);
  });

  it.each([
    ["id", 1],
    ["name", null],
  ])("refuses %s as %j", (field, value) => {
    expect(priceCategorySchema.safeParse({ ...almacen, [field]: value }).success).toBe(false);
  });
});

describe("priceProductSchema", () => {
  it("accepts a product with a price and one without", () => {
    expect(priceProductSchema.safeParse(priced).data).toEqual(priced);
    expect(priceProductSchema.safeParse(unpriced).data).toEqual(unpriced);
  });

  it("accepts a sale unit of each kind", () => {
    expect(priceProductSchema.safeParse({ ...priced, saleUnit: "UNIT" }).success).toBe(true);
    expect(priceProductSchema.safeParse({ ...priced, saleUnit: "KG" }).success).toBe(true);
  });

  it("strips keys it does not define", () => {
    expect(priceProductSchema.safeParse({ ...priced, active: true }).data).toEqual(priced);
    expect(
      priceProductSchema.safeParse({
        ...priced,
        currentPrice: { ...priced.currentPrice, priceListId: "list-1" },
      }).data,
    ).toEqual(priced);
  });

  it.each(Object.keys(priced))("requires %s", (field) => {
    const { [field as keyof typeof priced]: _omitted, ...rest } = priced;

    expect(priceProductSchema.safeParse(rest).success).toBe(false);
  });

  it.each(["id", "unitPrice", "validFrom"])("requires the current price's %s", (field) => {
    const { [field as keyof typeof priced.currentPrice]: _omitted, ...rest } = priced.currentPrice;

    expect(priceProductSchema.safeParse({ ...priced, currentPrice: rest }).success).toBe(false);
  });

  it.each([
    ["id", 1],
    ["name", null],
    ["categoryId", 1],
    ["categoryName", null],
    ["saleUnit", "LITER"],
    ["saleUnit", "kg"],
    ["currentPrice", undefined],
    ["currentPrice", "price-1"],
    ["lastReviewedAt", undefined],
    ["lastReviewedAt", 1758801600000],
    ["lastReviewedAt", "yesterday"],
    ["lastReviewedAt", "2026-09-25"],
    ["pending", "true"],
    ["pending", null],
  ])("refuses %s as %j", (field, value) => {
    expect(priceProductSchema.safeParse({ ...priced, [field]: value }).success).toBe(false);
  });

  it.each([
    ["id", 1],
    ["unitPrice", "750000"],
    ["unitPrice", 7500.5],
    ["unitPrice", null],
    ["validFrom", null],
    ["validFrom", "yesterday"],
    ["validFrom", 1758801600000],
  ])("refuses the current price's %s as %j", (field, value) => {
    const currentPrice = { ...priced.currentPrice, [field]: value };

    expect(priceProductSchema.safeParse({ ...priced, currentPrice }).success).toBe(false);
  });
});

describe("priceListSchema", () => {
  it("accepts a list, empty or not", () => {
    expect(priceListSchema.safeParse(list).data).toEqual(list);
    const empty = {
      products: [],
      categories: [],
      pendingCount: 0,
      activeProductCount: 0,
      reviewWindowDays: 30,
    };
    expect(priceListSchema.safeParse(empty).data).toEqual(empty);
  });

  it("strips keys it does not define", () => {
    expect(priceListSchema.safeParse({ ...list, generatedAt: at }).data).toEqual(list);
  });

  it.each(Object.keys(list))("requires %s", (field) => {
    const { [field as keyof typeof list]: _omitted, ...rest } = list;

    expect(priceListSchema.safeParse(rest).success).toBe(false);
  });

  it.each([
    ["products", undefined],
    ["products", {}],
    ["products", [{ ...priced, pending: "no" }]],
    ["categories", null],
    ["categories", [{ id: 1, name: "Almacén" }]],
    ["pendingCount", "1"],
    ["pendingCount", 1.5],
    ["activeProductCount", "2"],
    ["activeProductCount", 2.5],
    ["activeProductCount", -1],
    ["activeProductCount", null],
    ["reviewWindowDays", "30"],
    ["reviewWindowDays", 30.5],
    ["reviewWindowDays", null],
  ])("refuses %s as %j", (field, value) => {
    expect(priceListSchema.safeParse({ ...list, [field]: value }).success).toBe(false);
  });

  it.each([undefined, null, [], "prices"])("refuses %j as a list", (body) => {
    expect(priceListSchema.safeParse(body).success).toBe(false);
  });
});
