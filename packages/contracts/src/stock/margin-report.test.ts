import { describe, expect, it } from "vitest";
import { marginReportQuerySchema, marginReportSchema } from "./margin-report.js";

const REGISTER_ID = "4b0d2c1e-7f3a-4e58-9a61-0c5d8e2f1a77";
const CATEGORY_ID = "9a3f6c52-1d84-4b07-8c1e-5e7a2b9d4f10";

describe("marginReportQuerySchema", () => {
  it("accepts the group alone", () => {
    expect(marginReportQuerySchema.parse({ group: "product" })).toEqual({ group: "product" });
  });

  it("accepts the group with a range and a register", () => {
    const query = {
      group: "category",
      from: "2026-10-01",
      to: "2026-10-06",
      register_id: REGISTER_ID,
    };

    expect(marginReportQuerySchema.parse(query)).toEqual(query);
  });

  it.each([
    ["no group", {}],
    ["a group that is not offered", { group: "brand" }],
    ["a range ending before it starts", { group: "product", from: "2026-10-06", to: "2026-10-05" }],
    ["a register that is not an id", { group: "product", register_id: "caja-1" }],
  ])("refuses %s", (_name, query) => {
    expect(marginReportQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe("marginReportSchema", () => {
  const report = {
    range: { from: "2026-10-05", to: "2026-10-06" },
    group: "category",
    rows: [
      {
        id: CATEGORY_ID,
        path: ["Almacén", "Dulces"],
        brandName: null,
        netContent: null,
        amount: 36_000,
        cost: 40_000,
        margin: -4_000,
        incompleteSales: 2,
      },
      {
        id: null,
        path: [],
        brandName: null,
        netContent: null,
        amount: 500,
        cost: 0,
        margin: 500,
        incompleteSales: 0,
      },
    ],
    totals: { amount: 36_500, cost: 40_000, margin: -3_500, incompleteSales: 2 },
  };

  it("accepts the rows of a range with their totals, a margin that may be negative", () => {
    expect(marginReportSchema.parse(report)).toEqual(report);
  });

  it("accepts a product row with its brand name and net content", () => {
    const product = {
      ...report,
      group: "product",
      rows: [
        {
          ...report.rows[1],
          id: CATEGORY_ID,
          path: ["Aceite de Almendras"],
          brandName: "Vitora",
          netContent: { quantity: 30, unit: "ML" },
        },
      ],
    };

    expect(marginReportSchema.parse(product)).toEqual(product);
  });

  it.each(["brandName", "netContent", "incompleteSales", "cost", "margin"])(
    "requires %s in a row",
    (field) => {
      const { [field as "cost"]: _omitted, ...row } = report.rows[0] as (typeof report.rows)[0];

      expect(marginReportSchema.safeParse({ ...report, rows: [row] }).success).toBe(false);
    },
  );

  it("accepts a range without sales", () => {
    const empty = {
      ...report,
      rows: [],
      totals: { amount: 0, cost: 0, margin: 0, incompleteSales: 0 },
    };

    expect(marginReportSchema.parse(empty)).toEqual(empty);
  });

  it.each([
    ["a group that is not offered", { group: "brand" }],
    ["a row id that is not a record id", { rows: [{ ...report.rows[0], id: "x" }] }],
    ["a negative amount", { rows: [{ ...report.rows[1], amount: -1 }] }],
    ["a negative cost", { rows: [{ ...report.rows[1], cost: -1 }] }],
    ["a cost with decimals", { rows: [{ ...report.rows[1], cost: 1.5 }] }],
    ["a margin with decimals", { rows: [{ ...report.rows[1], margin: 1.5 }] }],
    [
      "a negative count of incomplete sales",
      { rows: [{ ...report.rows[1], incompleteSales: -1 }] },
    ],
    ["a total missing its incomplete sales", { totals: { amount: 1, cost: 0, margin: 1 } }],
    ["a total that is not a number", { totals: { ...report.totals, margin: "1" } }],
    ["a range bound that is not a calendar day", { range: { from: "ayer", to: "2026-10-06" } }],
  ])("refuses %s", (_name, change) => {
    expect(marginReportSchema.safeParse({ ...report, ...change }).success).toBe(false);
  });
});
