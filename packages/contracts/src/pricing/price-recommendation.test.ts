import { MAX_STOCK_QUANTITY, MAX_UNIT_PRICE_CENTS } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import {
  priceRecommendationQuerySchema,
  priceRecommendationSchema,
} from "./price-recommendation.js";

const ALMONDS = "11111111-1111-1111-1111-111111111111";
const RAISINS = "22222222-2222-2222-2222-222222222222";
const at = "2026-09-25T12:00:00.000Z";

function firstFailure(value: unknown): { path: unknown[]; message: unknown } | undefined {
  const result = priceRecommendationQuerySchema.safeParse(value);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { path: issue.path, message: issue.message };
}

describe("priceRecommendationQuerySchema", () => {
  it("reads the components with the quantity of each per unit of the product", () => {
    const parsed = priceRecommendationQuerySchema.safeParse({
      components: `${ALMONDS}:600,${RAISINS}:400`,
    });

    expect(parsed.data).toEqual({
      components: [
        { componentProductId: ALMONDS, quantityPerOutputUnit: 600 },
        { componentProductId: RAISINS, quantityPerOutputUnit: 400 },
      ],
    });
  });

  it("reads the proposed unit price in cents when it is given", () => {
    const parsed = priceRecommendationQuerySchema.safeParse({
      components: `${ALMONDS}:600`,
      unitPrice: "1600000",
    });

    expect(parsed.data).toEqual({
      components: [{ componentProductId: ALMONDS, quantityPerOutputUnit: 600 }],
      unitPrice: 1_600_000,
    });
  });

  it("reads ids in upper case in lower case", () => {
    const parsed = priceRecommendationQuerySchema.parse({
      components: `${ALMONDS.replace(/1/g, "A")}:600`,
    });

    expect(parsed.components[0]?.componentProductId).toBe(ALMONDS.replace(/1/g, "a"));
  });

  it("accepts the largest stock quantity and the largest price", () => {
    const parsed = priceRecommendationQuerySchema.safeParse({
      components: `${ALMONDS}:${MAX_STOCK_QUANTITY}`,
      unitPrice: String(MAX_UNIT_PRICE_CENTS),
    });

    expect(parsed.success).toBe(true);
  });

  it.each([undefined, "", 7])("rejects the components %j", (components) => {
    expect(firstFailure({ components })?.path).toEqual(["components"]);
  });

  it.each([
    "not-an-entry",
    `${ALMONDS}`,
    `${ALMONDS}:`,
    `${ALMONDS}:0`,
    `${ALMONDS}:-5`,
    `${ALMONDS}:1.5`,
    `${ALMONDS}:${MAX_STOCK_QUANTITY + 1}`,
    `not-a-uuid:600`,
    `${ALMONDS}:600,`,
    `${ALMONDS}:600,${RAISINS}:abc`,
  ])("rejects the component list %j", (components) => {
    expect(firstFailure({ components })?.path).toEqual(["components"]);
  });

  it.each(["", "0", "-1", "1.5", "abc", String(MAX_UNIT_PRICE_CENTS + 1)])(
    "rejects the proposed price %j",
    (unitPrice) => {
      expect(firstFailure({ components: `${ALMONDS}:600`, unitPrice })).toEqual({
        path: ["unitPrice"],
        message: "unitPrice must be a positive integer number of cents",
      });
    },
  );

  it("says what is wrong with an entry that is not a component and a quantity", () => {
    expect(firstFailure({ components: `${ALMONDS}:0` })?.message).toBe(
      "components must be component ids with a positive integer number of thousandths, as id:quantity separated by commas",
    );
  });
});

describe("priceRecommendationSchema", () => {
  const read = {
    currentPrice: { id: "price-1", unitPrice: 1_500_000, validFrom: at },
    recommendation: { kind: "recommended", unitPrice: 1_600_000 },
    batchCost: { kind: "known", unitCostCents: 1_200_000, marginTenthsOfPercent: 250 },
  };

  it("accepts a recommendation with the margin over the batch cost", () => {
    expect(priceRecommendationSchema.safeParse(read).data).toEqual(read);
  });

  it("accepts a product with no current price and no batch", () => {
    const answer = {
      currentPrice: null,
      recommendation: read.recommendation,
      batchCost: { kind: "none" },
    };

    expect(priceRecommendationSchema.safeParse(answer).data).toEqual(answer);
  });

  it("accepts the components without a price in place of a recommendation", () => {
    const answer = {
      ...read,
      recommendation: { kind: "missing_prices", componentProductIds: [ALMONDS] },
      batchCost: { kind: "incomplete" },
    };

    expect(priceRecommendationSchema.safeParse(answer).data).toEqual(answer);
  });

  it("accepts a known batch cost without a margin", () => {
    const answer = {
      ...read,
      batchCost: { kind: "known", unitCostCents: 1_200_000, marginTenthsOfPercent: null },
    };

    expect(priceRecommendationSchema.safeParse(answer).data).toEqual(answer);
  });

  it.each([
    [
      "a price date that is not an ISO instant",
      { ...read, currentPrice: { ...read.currentPrice, validFrom: "yesterday" } },
    ],
    ["an unknown recommendation", { ...read, recommendation: { kind: "other" } }],
    ["an unknown batch cost", { ...read, batchCost: { kind: "other" } }],
    ["a missing recommendation", { currentPrice: null, batchCost: { kind: "none" } }],
    [
      "a known batch cost without its cost",
      { ...read, batchCost: { kind: "known", marginTenthsOfPercent: 1 } },
    ],
  ])("rejects %s", (_name, answer) => {
    expect(priceRecommendationSchema.safeParse(answer).success).toBe(false);
  });
});
