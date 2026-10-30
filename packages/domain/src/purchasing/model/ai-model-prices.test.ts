import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  AI_MODEL_PRICES,
  type AiModelPrice,
  aiAttemptCostNanoUsd,
  priceInEffect,
} from "./ai-model-prices.js";

function aPrice(overrides: Partial<AiModelPrice> = {}): AiModelPrice {
  return {
    model: "model-a",
    appliesFrom: new Date("2026-01-01T00:00:00Z"),
    inputMicroUsdPerMillionTokens: 2_000_000,
    outputMicroUsdPerMillionTokens: 10_000_000,
    cacheWriteMicroUsdPerMillionTokens: 2_500_000,
    cacheReadMicroUsdPerMillionTokens: 200_000,
    ...overrides,
  };
}

function anAttempt(overrides: Partial<Parameters<typeof aiAttemptCostNanoUsd>[1]> = {}) {
  return {
    model: "model-a",
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    ...overrides,
  };
}

const AT = new Date("2026-06-01T00:00:00Z");
const tokens = fc.integer({ min: 0, max: 50_000_000 });

describe("AI_MODEL_PRICES", () => {
  it.each(["claude-sonnet-5-5", "claude-sonnet-5"])(
    "prices %s from 2026-01-01 at 2, 10, 2.50 and 0.20 US dollars per million tokens",
    (model) => {
      expect(priceInEffect(AI_MODEL_PRICES, model, new Date("2026-01-01T00:00:00Z"))).toEqual({
        model,
        appliesFrom: new Date("2026-01-01T00:00:00Z"),
        inputMicroUsdPerMillionTokens: 2_000_000,
        outputMicroUsdPerMillionTokens: 10_000_000,
        cacheWriteMicroUsdPerMillionTokens: 2_500_000,
        cacheReadMicroUsdPerMillionTokens: 200_000,
      });
    },
  );

  it("has no price before 2026-01-01", () => {
    expect(
      priceInEffect(AI_MODEL_PRICES, "claude-sonnet-5-5", new Date("2025-12-31T23:59:59.999Z")),
    ).toBeNull();
  });
});

describe("priceInEffect", () => {
  it("is null for a model the table does not price", () => {
    expect(priceInEffect([aPrice()], "model-b", AT)).toBeNull();
  });

  it("applies a price from the instant it applies from", () => {
    const table = [aPrice({ appliesFrom: new Date("2026-06-01T00:00:00Z") })];

    expect(priceInEffect(table, "model-a", new Date("2026-05-31T23:59:59.999Z"))).toBeNull();
    expect(priceInEffect(table, "model-a", new Date("2026-06-01T00:00:00Z"))).toEqual(table[0]);
  });

  it("takes the latest price that already applies, whatever the table's order", () => {
    const older = aPrice({ appliesFrom: new Date("2026-01-01T00:00:00Z") });
    const newer = aPrice({
      appliesFrom: new Date("2026-04-01T00:00:00Z"),
      inputMicroUsdPerMillionTokens: 3_000_000,
    });
    const future = aPrice({
      appliesFrom: new Date("2026-09-01T00:00:00Z"),
      inputMicroUsdPerMillionTokens: 4_000_000,
    });

    expect(priceInEffect([future, older, newer], "model-a", AT)).toEqual(newer);
    expect(
      priceInEffect([newer, future, older], "model-a", new Date("2026-03-31T23:59:59Z")),
    ).toEqual(older);
  });

  it("ignores the prices of other models when choosing the latest", () => {
    const other = aPrice({ model: "model-b", appliesFrom: new Date("2026-05-01T00:00:00Z") });
    const own = aPrice();

    expect(priceInEffect([own, other], "model-a", AT)).toEqual(own);
  });
});

describe("aiAttemptCostNanoUsd", () => {
  it("costs each kind of token at its own price", () => {
    const table = [aPrice()];

    expect(aiAttemptCostNanoUsd(table, anAttempt({ inputTokens: 1_000_000 }), AT)).toBe(
      2_000_000_000,
    );
    expect(aiAttemptCostNanoUsd(table, anAttempt({ outputTokens: 1_000_000 }), AT)).toBe(
      10_000_000_000,
    );
    expect(aiAttemptCostNanoUsd(table, anAttempt({ cacheWriteTokens: 1_000_000 }), AT)).toBe(
      2_500_000_000,
    );
    expect(aiAttemptCostNanoUsd(table, anAttempt({ cacheReadTokens: 1_000_000 }), AT)).toBe(
      200_000_000,
    );
  });

  it("costs a single token in nanodollars exactly", () => {
    expect(aiAttemptCostNanoUsd([aPrice()], anAttempt({ outputTokens: 1 }), AT)).toBe(10_000);
    expect(aiAttemptCostNanoUsd([aPrice()], anAttempt({ cacheReadTokens: 1 }), AT)).toBe(200);
  });

  it("is null when no price is in effect for the model at that instant", () => {
    const table = [aPrice({ appliesFrom: new Date("2026-07-01T00:00:00Z") })];

    expect(aiAttemptCostNanoUsd(table, anAttempt({ inputTokens: 5 }), AT)).toBeNull();
    expect(
      aiAttemptCostNanoUsd(table, anAttempt({ model: "other", inputTokens: 5 }), AT),
    ).toBeNull();
  });

  it("uses the price in effect at the instant, so a later price change leaves earlier calls alone", () => {
    const table = [
      aPrice(),
      aPrice({
        appliesFrom: new Date("2026-07-01T00:00:00Z"),
        inputMicroUsdPerMillionTokens: 4_000_000,
      }),
    ];
    const attempt = anAttempt({ inputTokens: 1_000_000 });

    expect(aiAttemptCostNanoUsd(table, attempt, new Date("2026-06-30T23:59:59Z"))).toBe(
      2_000_000_000,
    );
    expect(aiAttemptCostNanoUsd(table, attempt, new Date("2026-07-01T00:00:00Z"))).toBe(
      4_000_000_000,
    );
  });

  it("rounds a fraction of a nanodollar half up", () => {
    const table = [aPrice({ inputMicroUsdPerMillionTokens: 1_499 })];

    expect(aiAttemptCostNanoUsd(table, anAttempt({ inputTokens: 1 }), AT)).toBe(1);
    expect(
      aiAttemptCostNanoUsd(
        [aPrice({ inputMicroUsdPerMillionTokens: 1_500 })],
        anAttempt({ inputTokens: 1 }),
        AT,
      ),
    ).toBe(2);
  });

  it("rounds the whole attempt once, not each kind of token", () => {
    const table = [
      aPrice({
        inputMicroUsdPerMillionTokens: 400,
        outputMicroUsdPerMillionTokens: 400,
      }),
    ];

    expect(aiAttemptCostNanoUsd(table, anAttempt({ inputTokens: 1, outputTokens: 1 }), AT)).toBe(1);
  });

  it("costs nothing for no tokens", () => {
    expect(
      aiAttemptCostNanoUsd(AI_MODEL_PRICES, anAttempt({ model: "claude-sonnet-5-5" }), AT),
    ).toBe(0);
  });

  it("adds up the cost of each kind of token when the prices are whole nanodollars per token", () => {
    fc.assert(
      fc.property(tokens, tokens, tokens, tokens, (input, output, cacheWrite, cacheRead) => {
        const table = [aPrice()];
        const whole = aiAttemptCostNanoUsd(
          table,
          anAttempt({
            inputTokens: input,
            outputTokens: output,
            cacheWriteTokens: cacheWrite,
            cacheReadTokens: cacheRead,
          }),
          AT,
        );
        const parts = [
          anAttempt({ inputTokens: input }),
          anAttempt({ outputTokens: output }),
          anAttempt({ cacheWriteTokens: cacheWrite }),
          anAttempt({ cacheReadTokens: cacheRead }),
        ].map((attempt) => aiAttemptCostNanoUsd(table, attempt, AT));

        expect(whole).toBe(parts.reduce<number>((sum, part) => sum + (part ?? 0), 0));
      }),
    );
  });

  it("never costs less for more tokens", () => {
    const costOf = (outputTokens: number) =>
      aiAttemptCostNanoUsd(
        AI_MODEL_PRICES,
        anAttempt({ model: "claude-sonnet-5", outputTokens }),
        AT,
      ) ?? Number.NaN;

    fc.assert(
      fc.property(tokens, tokens, (a, b) => {
        expect(costOf(Math.min(a, b))).toBeLessThanOrEqual(costOf(Math.max(a, b)));
      }),
    );
  });
});
