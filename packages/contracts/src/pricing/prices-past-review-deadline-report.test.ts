import { ARGENTINA_TIME_ZONE } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import {
  pricesPastReviewDeadlineReportQuerySchema,
  pricesPastReviewDeadlineReportSchema,
} from "./prices-past-review-deadline-report.js";

describe("pricesPastReviewDeadlineReportQuerySchema", () => {
  it("accepts no period", () => {
    expect(pricesPastReviewDeadlineReportQuerySchema.parse({})).toEqual({});
  });

  it("accepts a period, including one of a single day", () => {
    expect(
      pricesPastReviewDeadlineReportQuerySchema.parse({ from: "2026-12-01", to: "2026-12-31" }),
    ).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    expect(
      pricesPastReviewDeadlineReportQuerySchema.safeParse({ from: "2026-12-01", to: "2026-12-01" })
        .success,
    ).toBe(true);
  });

  it.each([
    ["only the first day", { from: "2026-12-01" }],
    ["only the last day", { to: "2026-12-31" }],
    ["a period that ends before it starts", { from: "2026-12-31", to: "2026-12-01" }],
    ["a day that is not a calendar day", { from: "2026-02-30", to: "2026-03-01" }],
    ["text instead of a day", { from: "pronto", to: "luego" }],
  ])("refuses %s", (_name, query) => {
    expect(pricesPastReviewDeadlineReportQuerySchema.safeParse(query).success).toBe(false);
  });

  it("drops a register, which prices do not carry", () => {
    expect(
      pricesPastReviewDeadlineReportQuerySchema.parse({
        from: "2026-12-01",
        to: "2026-12-31",
        register_id: "9a3f6c52-1d84-4b07-8c1e-5e7a2b9d4f10",
      }),
    ).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });
});

describe("pricesPastReviewDeadlineReportSchema", () => {
  const price = {
    product: {
      id: "product-1",
      name: "Queso cremoso",
      brand_name: "Vitora",
      net_content: { quantity: 250, unit: "G" },
      category_id: "category-1",
      category_name: "Lácteos",
      sale_unit: "KG",
    },
    current_price: { unit_price_cents: 2_300, valid_from: "2026-01-05T15:00:00.000Z" },
    last_reviewed_at: "2026-01-29T15:00:00.000Z",
    past_deadline_on: "2026-02-28",
    reason: "overdue",
  };
  const report = {
    period: { from: "2026-02-28", to: "2026-03-10" },
    window_days: 30,
    prices: [price],
    summary: { price_count: 1 },
  };

  it("accepts the period, the window, the prices and the summary", () => {
    expect(pricesPastReviewDeadlineReportSchema.parse(report)).toEqual(report);
  });

  it("accepts a price never reviewed or never priced, without a deadline day", () => {
    const never = {
      ...report,
      prices: [
        {
          ...price,
          current_price: null,
          last_reviewed_at: null,
          past_deadline_on: null,
          reason: "never_reviewed",
        },
      ],
    };

    expect(pricesPastReviewDeadlineReportSchema.parse(never)).toEqual(never);
  });

  it.each(["overdue", "postponed", "never_reviewed"])("accepts the reason %s", (reason) => {
    expect(
      pricesPastReviewDeadlineReportSchema.safeParse({
        ...report,
        prices: [{ ...price, reason }],
      }).success,
    ).toBe(true);
  });

  it.each([
    ["a reason that does not exist", { reason: "forgotten" }],
    ["a missing reason", { reason: undefined }],
    ["a deadline day that is not a calendar day", { past_deadline_on: "pronto" }],
    ["a missing deadline day", { past_deadline_on: undefined }],
    ["a last review that is not an instant", { last_reviewed_at: "ayer" }],
    ["a missing last review", { last_reviewed_at: undefined }],
    ["a missing current price", { current_price: undefined }],
    [
      "a price with decimals",
      { current_price: { unit_price_cents: 1.5, valid_from: "2026-01-05T15:00:00.000Z" } },
    ],
    [
      "a price valid from something that is not an instant",
      { current_price: { unit_price_cents: 100, valid_from: "ayer" } },
    ],
    ["a sale unit that is not offered", { product: { ...price.product, sale_unit: "LITRO" } }],
    ["a missing brand name", { product: { ...price.product, brand_name: undefined } }],
    ["a missing net content", { product: { ...price.product, net_content: undefined } }],
  ])("refuses a price with %s", (_name, change) => {
    expect(
      pricesPastReviewDeadlineReportSchema.safeParse({
        ...report,
        prices: [{ ...price, ...change }],
      }).success,
    ).toBe(false);
  });

  it.each([
    ["a period day that is not a calendar day", { period: { from: "ayer", to: "2026-03-10" } }],
    ["a window with decimals", { window_days: 1.5 }],
    ["a missing window", { window_days: undefined }],
    ["a price count with decimals", { summary: { price_count: 1.5 } }],
    ["a missing price count", { summary: {} }],
  ])("refuses %s", (_name, change) => {
    expect(pricesPastReviewDeadlineReportSchema.safeParse({ ...report, ...change }).success).toBe(
      false,
    );
  });

  it("marks the instants it shows as read in Argentina's time zone", () => {
    const priceShape = pricesPastReviewDeadlineReportSchema.shape.prices.element.shape;

    expect(priceShape.last_reviewed_at.meta()).toEqual({ timeZone: ARGENTINA_TIME_ZONE });
    expect(priceShape.current_price.unwrap().shape.valid_from.meta()).toEqual({
      timeZone: ARGENTINA_TIME_ZONE,
    });
  });
});
