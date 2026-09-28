import { MAX_UNIT_PRICE_CENTS } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { priceSetBodySchema } from "./price-set.js";

const PRICE_ID = "11111111-1111-1111-1111-111111111111";

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { unitPrice: 1250, expectedCurrentPriceId: PRICE_ID, ...overrides };
}

function firstIssue(body: unknown): { field: unknown; message: string } | undefined {
  const result = priceSetBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { field: issue.path[0], message: issue.message };
}

describe("priceSetBodySchema", () => {
  it("accepts a price and the id of the price it replaces", () => {
    expect(priceSetBodySchema.safeParse(validBody())).toMatchObject({
      success: true,
      data: { unitPrice: 1250, expectedCurrentPriceId: PRICE_ID },
    });
  });

  it("accepts null as the expected current price for a product with no price yet", () => {
    expect(priceSetBodySchema.safeParse(validBody({ expectedCurrentPriceId: null }))).toMatchObject(
      { success: true, data: { expectedCurrentPriceId: null } },
    );
  });

  it("accepts the smallest amount and the largest amount a price can hold", () => {
    expect(priceSetBodySchema.safeParse(validBody({ unitPrice: 1 })).success).toBe(true);
    expect(
      priceSetBodySchema.safeParse(validBody({ unitPrice: MAX_UNIT_PRICE_CENTS })).success,
    ).toBe(true);
  });

  it.each([undefined, 0, -100, 12.5, "1250", null, MAX_UNIT_PRICE_CENTS + 1, Number.NaN])(
    "rejects the unit price %j",
    (unitPrice) => {
      expect(firstIssue(validBody({ unitPrice }))).toEqual({
        field: "unitPrice",
        message: "unitPrice must be a positive integer number of cents",
      });
    },
  );

  it.each([undefined, "", "not-a-uuid", 42, `${PRICE_ID}0`, ` ${PRICE_ID}`])(
    "rejects the expected current price id %j",
    (expectedCurrentPriceId) => {
      expect(firstIssue(validBody({ expectedCurrentPriceId }))).toEqual({
        field: "expectedCurrentPriceId",
        message: "expectedCurrentPriceId must be an existing price's id, or null",
      });
    },
  );

  it("accepts an id in upper case and one with unusual version and variant digits", () => {
    expect(
      priceSetBodySchema.safeParse(validBody({ expectedCurrentPriceId: PRICE_ID.toUpperCase() }))
        .success,
    ).toBe(true);
    expect(
      priceSetBodySchema.safeParse(
        validBody({ expectedCurrentPriceId: "00000000-0000-0000-0000-000000000000" }),
      ).success,
    ).toBe(true);
  });

  it("reports the unit price before the expected current price id", () => {
    expect(firstIssue({})?.field).toBe("unitPrice");
  });
});
