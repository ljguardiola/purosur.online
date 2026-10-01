import { NET_CONTENT_UNITS, SALE_UNITS } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { productListSchema, productSummarySchema } from "./product-summary.js";

const honey = {
  id: "product-1",
  name: "Miel pura de abeja 1 kg",
  categoryId: "category-1",
  categoryName: "Almacén",
  brandId: null,
  saleUnit: "UNIT",
  barcodes: ["7790987000015"],
  tagIds: [],
  netContent: null,
  active: true,
  labelCode: null,
  version: 1,
};
const almonds = {
  ...honey,
  id: "product-2",
  name: "Almendras",
  saleUnit: "KG",
  barcodes: [],
  tagIds: ["tag-1", "tag-2"],
  brandId: "brand-1",
  netContent: { quantity: 0.5, unit: "KG" },
  active: false,
};

describe("productSummarySchema", () => {
  it("accepts a product without net content and one with it", () => {
    expect(productSummarySchema.safeParse(honey).data).toEqual(honey);
    expect(productSummarySchema.safeParse(almonds).data).toEqual(almonds);
  });

  it("accepts the code a product's label carries", () => {
    expect(productSummarySchema.safeParse({ ...honey, labelCode: "2000000000015" }).data).toEqual({
      ...honey,
      labelCode: "2000000000015",
    });
  });

  it("strips keys it does not define, also inside the net content", () => {
    expect(
      productSummarySchema.safeParse({
        ...almonds,
        cost: 10,
        netContent: { quantity: 0.5, unit: "KG", label: "media" },
      }).data,
    ).toEqual(almonds);
  });

  it.each(SALE_UNITS)("accepts the sale unit %s", (saleUnit) => {
    expect(productSummarySchema.safeParse({ ...honey, saleUnit }).success).toBe(true);
  });

  it.each(NET_CONTENT_UNITS)("accepts the net content unit %s", (unit) => {
    expect(
      productSummarySchema.safeParse({ ...honey, netContent: { quantity: 1, unit } }).success,
    ).toBe(true);
  });

  it.each([
    "id",
    "name",
    "categoryId",
    "categoryName",
    "brandId",
    "saleUnit",
    "barcodes",
    "tagIds",
    "netContent",
    "active",
    "labelCode",
    "version",
  ])("requires %s", (field) => {
    const { [field as keyof typeof honey]: _omitted, ...rest } = honey;

    expect(productSummarySchema.safeParse(rest).success).toBe(false);
  });

  it.each([
    ["id", 1],
    ["name", null],
    ["categoryId", 1],
    ["categoryName", null],
    ["brandId", 1],
    ["brandId", undefined],
    ["saleUnit", "BOX"],
    ["saleUnit", "unit"],
    ["saleUnit", 1],
    ["barcodes", "7790987000015"],
    ["barcodes", [7790987000015]],
    ["barcodes", null],
    ["tagIds", "tag-1"],
    ["tagIds", [1]],
    ["tagIds", null],
    ["tagIds", undefined],
    ["netContent", "1 kg"],
    ["netContent", {}],
    ["netContent", { quantity: "1", unit: "KG" }],
    ["netContent", { quantity: 1, unit: "TON" }],
    ["netContent", { quantity: 1 }],
    ["netContent", { unit: "KG" }],
    ["netContent", { quantity: null, unit: "KG" }],
    ["netContent", { quantity: 1, unit: null }],
    ["active", "true"],
    ["active", null],
    ["labelCode", 2000000000015],
    ["labelCode", undefined],
    ["version", "1"],
    ["version", 1.5],
    ["version", null],
  ])("refuses %s as %j", (field, value) => {
    expect(productSummarySchema.safeParse({ ...honey, [field]: value }).success).toBe(false);
  });

  it("accepts a fractional net content quantity", () => {
    expect(
      productSummarySchema.safeParse({ ...honey, netContent: { quantity: 0.25, unit: "L" } })
        .success,
    ).toBe(true);
  });
});

describe("productListSchema", () => {
  it("accepts a list of products, empty or not", () => {
    expect(productListSchema.safeParse([]).data).toEqual([]);
    expect(productListSchema.safeParse([honey, almonds]).data).toEqual([honey, almonds]);
  });

  it.each([undefined, null, {}, "products", honey])("refuses %j as a list", (body) => {
    expect(productListSchema.safeParse(body).success).toBe(false);
  });

  it("refuses a list holding a malformed product", () => {
    expect(productListSchema.safeParse([honey, { ...almonds, active: "no" }]).success).toBe(false);
  });
});
