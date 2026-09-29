import { describe, expect, it } from "vitest";
import { categoryListSchema, categorySummarySchema } from "./category-summary.js";

const seeds = { id: "category-1", name: "Semillas", version: 1, parentId: null };
const child = { id: "category-2", name: "Girasol", version: 3, parentId: "category-1" };

describe("categorySummarySchema", () => {
  it("accepts a top-level category and one under a parent", () => {
    expect(categorySummarySchema.safeParse(seeds).data).toEqual(seeds);
    expect(categorySummarySchema.safeParse(child).data).toEqual(child);
  });

  it("strips keys it does not define", () => {
    expect(categorySummarySchema.safeParse({ ...seeds, createdAt: "today" }).data).toEqual(seeds);
  });

  it.each(["id", "name", "version", "parentId"])("requires %s", (field) => {
    const { [field as keyof typeof seeds]: _omitted, ...rest } = seeds;

    expect(categorySummarySchema.safeParse(rest).success).toBe(false);
  });

  it.each([
    ["id", 1],
    ["id", null],
    ["name", 1],
    ["name", null],
    ["version", "1"],
    ["version", null],
    ["version", 1.5],
    ["parentId", 1],
    ["parentId", undefined],
  ])("refuses %s as %j", (field, value) => {
    expect(categorySummarySchema.safeParse({ ...seeds, [field]: value }).success).toBe(false);
  });
});

describe("categoryListSchema", () => {
  it("accepts a list of categories, empty or not", () => {
    expect(categoryListSchema.safeParse([]).data).toEqual([]);
    expect(categoryListSchema.safeParse([seeds, child]).data).toEqual([seeds, child]);
  });

  it.each([undefined, null, {}, "categories", seeds])("refuses %j as a list", (body) => {
    expect(categoryListSchema.safeParse(body).success).toBe(false);
  });

  it("refuses a list holding a malformed category", () => {
    expect(categoryListSchema.safeParse([seeds, { ...child, version: "3" }]).success).toBe(false);
  });
});
