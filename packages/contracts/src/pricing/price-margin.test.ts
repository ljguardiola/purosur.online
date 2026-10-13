import { MAX_UNIT_PRICE_CENTS } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { priceMarginQuerySchema, priceMarginSchema } from "./price-margin.js";

const costReference = {
  lastCostCents: 1200,
  freightPerUnitCents: 0,
  totalCostCents: 1200,
  marginTenthsOfPercent: 400,
};

describe("priceMarginSchema", () => {
  it("accepts a cost reference", () => {
    expect(priceMarginSchema.safeParse({ costReference }).data).toEqual({ costReference });
  });

  it("accepts a product with no cost reference", () => {
    expect(priceMarginSchema.safeParse({ costReference: null }).data).toEqual({
      costReference: null,
    });
  });

  it("requires the cost reference", () => {
    expect(priceMarginSchema.safeParse({}).success).toBe(false);
  });

  it("refuses a cost reference with a fractional amount", () => {
    expect(
      priceMarginSchema.safeParse({ costReference: { ...costReference, totalCostCents: 1.5 } })
        .success,
    ).toBe(false);
  });
});

describe("priceMarginQuerySchema", () => {
  it("reads the unit price from its text as a number", () => {
    expect(priceMarginQuerySchema.safeParse({ unitPrice: "1250" }).data).toEqual({
      unitPrice: 1250,
    });
  });

  it("accepts the smallest and the largest amount a price can hold", () => {
    expect(priceMarginQuerySchema.safeParse({ unitPrice: "1" }).success).toBe(true);
    expect(
      priceMarginQuerySchema.safeParse({ unitPrice: String(MAX_UNIT_PRICE_CENTS) }).success,
    ).toBe(true);
  });

  it.each([
    undefined,
    "",
    " ",
    "0",
    "-100",
    "12.5",
    "1e3",
    "0x10",
    "abc",
    " 100",
    "100 ",
    "+100",
    String(MAX_UNIT_PRICE_CENTS + 1),
    ["100", "200"],
  ])("rejects the unit price %j with the message of the price body", (unitPrice) => {
    const result = priceMarginQuerySchema.safeParse({ unitPrice });

    expect(result.success ? undefined : result.error.issues[0]).toMatchObject({
      path: ["unitPrice"],
      message: "unitPrice must be a positive integer number of cents",
    });
  });
});
