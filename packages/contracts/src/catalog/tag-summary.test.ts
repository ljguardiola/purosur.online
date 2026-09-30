import { describe, expect, it } from "vitest";
import { tagListSchema, tagSummarySchema } from "./tag-summary.js";

const sinTacc = { id: "tag-1", name: "Sin TACC", active: true, version: 1, productCount: 42 };
const vegano = {
  id: "tag-2",
  name: "Vegano",
  active: false,
  version: 3,
  productCount: 0,
};

describe("tagSummarySchema", () => {
  it("accepts an active tag and an inactive one", () => {
    expect(tagSummarySchema.safeParse(sinTacc).data).toEqual(sinTacc);
    expect(tagSummarySchema.safeParse(vegano).data).toEqual(vegano);
  });

  it("strips keys it does not define", () => {
    expect(tagSummarySchema.safeParse({ ...sinTacc, createdAt: "today" }).data).toEqual(sinTacc);
  });

  it.each(["id", "name", "active", "version", "productCount"])("requires %s", (field) => {
    const { [field as keyof typeof sinTacc]: _omitted, ...rest } = sinTacc;

    expect(tagSummarySchema.safeParse(rest).success).toBe(false);
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
    expect(tagSummarySchema.safeParse({ ...sinTacc, [field]: value }).success).toBe(false);
  });
});

describe("tagListSchema", () => {
  const list = { tags: [sinTacc, vegano], taggedProductCount: 42 };

  it("accepts the tags with how many distinct products carry any of them, empty or not", () => {
    expect(tagListSchema.safeParse(list).data).toEqual(list);
    expect(tagListSchema.safeParse({ tags: [], taggedProductCount: 0 }).data).toEqual({
      tags: [],
      taggedProductCount: 0,
    });
  });

  it.each(["tags", "taggedProductCount"])("requires %s", (field) => {
    const { [field as keyof typeof list]: _omitted, ...rest } = list;

    expect(tagListSchema.safeParse(rest).success).toBe(false);
  });

  it.each([
    ["taggedProductCount", 1.5],
    ["taggedProductCount", -1],
    ["taggedProductCount", "42"],
    ["tags", sinTacc],
    ["tags", [{ ...sinTacc, productCount: -1 }]],
  ])("refuses %s as %j", (field, value) => {
    expect(tagListSchema.safeParse({ ...list, [field]: value }).success).toBe(false);
  });

  it.each([undefined, null, [], [sinTacc], "tags"])("refuses %j as a list", (body) => {
    expect(tagListSchema.safeParse(body).success).toBe(false);
  });
});
