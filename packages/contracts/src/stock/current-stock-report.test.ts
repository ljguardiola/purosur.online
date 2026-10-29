import { describe, expect, it } from "vitest";
import { currentStockReportQuerySchema, currentStockReportSchema } from "./current-stock-report.js";

const CATEGORY_ID = "9a3f6c52-1d84-4b07-8c1e-5e7a2b9d4f10";

describe("currentStockReportQuerySchema", () => {
  it("accepts no filter", () => {
    expect(currentStockReportQuerySchema.parse({})).toEqual({});
  });

  it("accepts a category", () => {
    expect(currentStockReportQuerySchema.parse({ category_id: CATEGORY_ID })).toEqual({
      category_id: CATEGORY_ID,
    });
  });

  it("refuses a category that is not an id", () => {
    expect(currentStockReportQuerySchema.safeParse({ category_id: "almacen" }).success).toBe(false);
  });
});

describe("currentStockReportSchema", () => {
  const lot = {
    id: "lot-1",
    lot_number: "L-77",
    expires_on: "2027-03-01",
    technical: false,
    remaining: 4_000,
    unit_cost_cents: 5_000,
    value_cents: 20_000,
  };
  const report = {
    products: [
      {
        id: "product-1",
        name: "Harina",
        brand_name: "Vitora",
        net_content: { quantity: 1, unit: "KG" },
        category_id: CATEGORY_ID,
        category_name: "Almacén",
        sale_unit: "KG",
        balance: 4_000,
        value_cents: 20_000,
        lots: [lot],
      },
    ],
    categories: [{ id: CATEGORY_ID, name: "Almacén" }],
    summary: {
      value_cents: 20_000,
      product_count: 1,
      negative_balance_count: 0,
      without_cost_count: 0,
    },
  };

  it("accepts the products with their lots and the summary", () => {
    expect(currentStockReportSchema.parse(report)).toEqual(report);
  });

  it("accepts a report without products", () => {
    const empty = {
      products: [],
      categories: [],
      summary: {
        value_cents: 0,
        product_count: 0,
        negative_balance_count: 0,
        without_cost_count: 0,
      },
    };

    expect(currentStockReportSchema.parse(empty)).toEqual(empty);
  });

  it("accepts a lot and a product without a known cost, and negative amounts", () => {
    const unknown = {
      ...report,
      products: [
        {
          ...report.products[0],
          balance: -1_000,
          value_cents: null,
          lots: [
            {
              ...lot,
              lot_number: null,
              expires_on: null,
              technical: true,
              remaining: -1_000,
              unit_cost_cents: null,
              value_cents: null,
            },
          ],
        },
      ],
    };

    expect(currentStockReportSchema.parse(unknown)).toEqual(unknown);
  });

  it.each([
    ["a sale unit that is not offered", { sale_unit: "LITRO" }],
    ["a missing brand name", { brand_name: undefined }],
    ["a missing net content", { net_content: undefined }],
    ["a balance with decimals", { balance: 1.5 }],
    ["a value with decimals", { value_cents: 10.5 }],
    [
      "a lot with an expiry that is not a calendar day",
      { lots: [{ ...lot, expires_on: "pronto" }] },
    ],
    ["a lot quantity with decimals", { lots: [{ ...lot, remaining: 0.5 }] }],
    ["a lot cost with decimals", { lots: [{ ...lot, unit_cost_cents: 1.5 }] }],
    ["a lot value that is not a number", { lots: [{ ...lot, value_cents: "20000" }] }],
    ["a lot without the technical flag", { lots: [{ ...lot, technical: undefined }] }],
  ])("refuses %s", (_name, change) => {
    const product = { ...report.products[0], ...change };

    expect(currentStockReportSchema.safeParse({ ...report, products: [product] }).success).toBe(
      false,
    );
  });

  it.each([
    ["a summary count with decimals", { ...report.summary, product_count: 1.5 }],
    ["a summary value with decimals", { ...report.summary, value_cents: 1.5 }],
    ["a missing negative count", { ...report.summary, negative_balance_count: undefined }],
    ["a missing without-cost count", { ...report.summary, without_cost_count: undefined }],
  ])("refuses %s", (_name, summary) => {
    expect(currentStockReportSchema.safeParse({ ...report, summary }).success).toBe(false);
  });

  it("refuses a category without a name", () => {
    expect(
      currentStockReportSchema.safeParse({ ...report, categories: [{ id: CATEGORY_ID }] }).success,
    ).toBe(false);
  });
});
