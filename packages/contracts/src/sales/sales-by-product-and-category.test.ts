import { describe, expect, it } from "vitest";
import {
  salesByProductAndCategoryQuerySchema,
  salesByProductAndCategorySchema,
} from "./sales-by-product-and-category.js";

const REGISTER_ID = "4b0d2c1e-7f3a-4e58-9a61-0c5d8e2f1a77";
const CATEGORY_ID = "9a3f6c52-1d84-4b07-8c1e-5e7a2b9d4f10";

describe("salesByProductAndCategoryQuerySchema", () => {
  it("accepts the group alone", () => {
    expect(salesByProductAndCategoryQuerySchema.parse({ group: "product" })).toEqual({
      group: "product",
    });
  });

  it("accepts the group with a range and a register", () => {
    const query = {
      group: "category",
      from: "2026-10-01",
      to: "2026-10-06",
      register_id: REGISTER_ID,
    };

    expect(salesByProductAndCategoryQuerySchema.parse(query)).toEqual(query);
  });

  it.each([
    ["no group", {}],
    ["a group that is not offered", { group: "brand" }],
    ["a range ending before it starts", { group: "product", from: "2026-10-06", to: "2026-10-05" }],
    ["a register that is not an id", { group: "product", register_id: "caja-1" }],
  ])("refuses %s", (_name, query) => {
    expect(salesByProductAndCategoryQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe("salesByProductAndCategorySchema", () => {
  const report = {
    range: { from: "2026-10-05", to: "2026-10-06" },
    group: "category",
    rows: [
      {
        id: CATEGORY_ID,
        path: ["Almacén", "Dulces"],
        units: 12,
        thousandths: 1_500,
        amount: 36_000,
      },
      { id: null, path: [], units: 1, thousandths: 0, amount: 500 },
    ],
    totals: { units: 13, thousandths: 1_500, amount: 36_500 },
  };

  it("accepts the rows of a range with their totals", () => {
    expect(salesByProductAndCategorySchema.parse(report)).toEqual(report);
  });

  it("accepts a range without sales", () => {
    const empty = { ...report, rows: [], totals: { units: 0, thousandths: 0, amount: 0 } };

    expect(salesByProductAndCategorySchema.parse(empty)).toEqual(empty);
  });

  it.each([
    ["a group that is not offered", { group: "brand" }],
    ["a row id that is not a record id", { rows: [{ ...report.rows[0], id: "x" }] }],
    ["a row without a path", { rows: [{ id: null, units: 1, thousandths: 0, amount: 1 }] }],
    ["a negative unit count", { rows: [{ ...report.rows[1], units: -1 }] }],
    ["a weight with decimals", { rows: [{ ...report.rows[1], thousandths: 1.5 }] }],
    ["an amount with decimals", { rows: [{ ...report.rows[1], amount: 10.5 }] }],
    ["a total that is not a number", { totals: { units: 13, thousandths: 0, amount: "36500" } }],
    ["a range bound that is not a calendar day", { range: { from: "ayer", to: "2026-10-06" } }],
  ])("refuses %s", (_name, change) => {
    expect(salesByProductAndCategorySchema.safeParse({ ...report, ...change }).success).toBe(false);
  });
});
