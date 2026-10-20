import { describe, expect, it } from "vitest";
import { salesByPromotionSchema } from "./sales-by-promotion.js";

const report = {
  range: { from: "2026-10-05", to: "2026-10-06" },
  rows: [
    {
      promotion_id: "4b0d2c1e-7f3a-4e58-9a61-0c5d8e2f1a77",
      name: "Finde de yerba",
      terms: {
        benefit: { kind: "PERCENT_OFF", percent: 15 },
        target: { kind: "CATEGORY", name: "Almacén › Yerbas" },
        weekdays: [6, 7],
      },
      lines: 3,
      units: 7,
      thousandths: 0,
      discounted: 2_100,
    },
    {
      promotion_id: "9a3f6c52-1d84-4b07-8c1e-5e7a2b9d4f10",
      name: null,
      terms: null,
      lines: 1,
      units: 0,
      thousandths: 1_250,
      discounted: 500,
    },
    {
      promotion_id: "0e8a5d31-6b2c-4f79-a3d4-8c1b7e9f2a65",
      name: "Tres por dos",
      terms: {
        benefit: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 },
        target: { kind: "PRODUCT", name: "Azúcar 1 kg" },
        weekdays: [],
      },
      lines: 1,
      units: 3,
      thousandths: 0,
      discounted: 300,
    },
  ],
  totals: {
    discounted: 2_900,
    lines: 5,
    most_used: {
      promotion_id: "4b0d2c1e-7f3a-4e58-9a61-0c5d8e2f1a77",
      name: "Finde de yerba",
      lines: 3,
    },
  },
};

describe("salesByPromotionSchema", () => {
  it("accepts the promotions of a range with their terms and totals", () => {
    expect(salesByPromotionSchema.parse(report)).toEqual(report);
  });

  it("accepts a range without discounts, which has no most used promotion", () => {
    const empty = { ...report, rows: [], totals: { discounted: 0, lines: 0, most_used: null } };

    expect(salesByPromotionSchema.parse(empty)).toEqual(empty);
  });

  it("accepts a most used promotion without a name", () => {
    const totals = {
      ...report.totals,
      most_used: { ...report.totals.most_used, name: null },
    };

    expect(salesByPromotionSchema.safeParse({ ...report, totals }).success).toBe(true);
  });

  it.each([
    ["an empty promotion id", { rows: [{ ...report.rows[0], promotion_id: "" }] }],
    ["a missing name", { rows: [{ ...report.rows[0], name: undefined }] }],
    ["missing terms", { rows: [{ ...report.rows[0], terms: undefined }] }],
    [
      "terms with an unknown benefit",
      {
        rows: [
          {
            ...report.rows[0],
            terms: { ...report.rows[0]?.terms, benefit: { kind: "FREE", percent: 100 } },
          },
        ],
      },
    ],
    [
      "terms with a percentage out of range",
      {
        rows: [
          {
            ...report.rows[0],
            terms: { ...report.rows[0]?.terms, benefit: { kind: "PERCENT_OFF", percent: 100 } },
          },
        ],
      },
    ],
    [
      "terms with an unknown target kind",
      {
        rows: [
          {
            ...report.rows[0],
            terms: { ...report.rows[0]?.terms, target: { kind: "BRAND", name: "X" } },
          },
        ],
      },
    ],
    [
      "terms with a target without a name",
      {
        rows: [
          {
            ...report.rows[0],
            terms: { ...report.rows[0]?.terms, target: { kind: "TAG" } },
          },
        ],
      },
    ],
    [
      "terms with weekdays that are not whole numbers",
      { rows: [{ ...report.rows[0], terms: { ...report.rows[0]?.terms, weekdays: [1.5] } }] },
    ],
    ["a negative line count", { rows: [{ ...report.rows[0], lines: -1 }] }],
    ["a line count with decimals", { rows: [{ ...report.rows[0], lines: 1.5 }] }],
    ["a negative unit count", { rows: [{ ...report.rows[0], units: -1 }] }],
    ["a unit count with decimals", { rows: [{ ...report.rows[0], units: 0.5 }] }],
    ["a negative weight", { rows: [{ ...report.rows[0], thousandths: -1 }] }],
    ["a weight with decimals", { rows: [{ ...report.rows[0], thousandths: 0.5 }] }],
    ["an amount with decimals", { rows: [{ ...report.rows[0], discounted: 10.5 }] }],
    ["a negative amount", { rows: [{ ...report.rows[0], discounted: -1 }] }],
    ["a missing total amount", { totals: { lines: 5, most_used: null } }],
    ["a negative total amount", { totals: { ...report.totals, discounted: -1 } }],
    ["a total line count with decimals", { totals: { ...report.totals, lines: 1.5 } }],
    ["a negative total line count", { totals: { ...report.totals, lines: -1 } }],
    ["a missing most used promotion", { totals: { discounted: 0, lines: 0 } }],
    [
      "a most used promotion without an id",
      { totals: { ...report.totals, most_used: { name: "X", lines: 1 } } },
    ],
    [
      "a most used promotion with an empty id",
      { totals: { ...report.totals, most_used: { promotion_id: "", name: "X", lines: 1 } } },
    ],
    [
      "a most used promotion with a negative line count",
      {
        totals: {
          ...report.totals,
          most_used: { ...report.totals.most_used, lines: -1 },
        },
      },
    ],
    [
      "a most used promotion with a line count with decimals",
      {
        totals: {
          ...report.totals,
          most_used: { ...report.totals.most_used, lines: 1.5 },
        },
      },
    ],
    ["a range bound that is not a calendar day", { range: { from: "ayer", to: "2026-10-06" } }],
  ])("refuses %s", (_name, change) => {
    expect(salesByPromotionSchema.safeParse({ ...report, ...change }).success).toBe(false);
  });
});
