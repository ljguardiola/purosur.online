import { describe, expect, it } from "vitest";
import { brandListSchema, brandSummarySchema } from "./brand-summary.js";

const granuz = { id: "brand-1", name: "Granuz", active: true, version: 1, productCount: 42 };
const litoral = {
  id: "brand-2",
  name: "Yerba del Litoral",
  active: false,
  version: 3,
  productCount: 0,
};

describe("brandSummarySchema", () => {
  it("accepts an active brand and an inactive one", () => {
    expect(brandSummarySchema.safeParse(granuz).data).toEqual(granuz);
    expect(brandSummarySchema.safeParse(litoral).data).toEqual(litoral);
  });

  it("strips keys it does not define", () => {
    expect(brandSummarySchema.safeParse({ ...granuz, createdAt: "today" }).data).toEqual(granuz);
  });

  it.each(["id", "name", "active", "version", "productCount"])("requires %s", (field) => {
    const { [field as keyof typeof granuz]: _omitted, ...rest } = granuz;

    expect(brandSummarySchema.safeParse(rest).success).toBe(false);
  });

  it.each([
    ["id", 1],
    ["name", null],
    ["active", "true"],
    ["version", 1.5],
    ["productCount", 1.5],
    ["productCount", -1],
    ["productCount", "42"],
  ])("refuses %s as %j", (field, value) => {
    expect(brandSummarySchema.safeParse({ ...granuz, [field]: value }).success).toBe(false);
  });
});

describe("brandListSchema", () => {
  it("accepts a list of brands, empty or not", () => {
    expect(brandListSchema.safeParse([]).data).toEqual([]);
    expect(brandListSchema.safeParse([granuz, litoral]).data).toEqual([granuz, litoral]);
  });

  it.each([undefined, null, {}, "brands", granuz])("refuses %j as a list", (body) => {
    expect(brandListSchema.safeParse(body).success).toBe(false);
  });
});
