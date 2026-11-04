import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { roundHalfUp } from "../../shared/index.js";
import { recommendedUnitPrice } from "./recommended-price.js";

const ALMONDS = "almonds";
const RAISINS = "raisins";

describe("recommendedUnitPrice", () => {
  it("adds each component's price times the quantity the recipe uses per unit", () => {
    const recommendation = recommendedUnitPrice(
      [
        { componentProductId: ALMONDS, quantityPerOutputUnit: 600 },
        { componentProductId: RAISINS, quantityPerOutputUnit: 400 },
      ],
      new Map([
        [ALMONDS, 2_000_000],
        [RAISINS, 1_000_000],
      ]),
    );

    expect(recommendation).toEqual({
      kind: "recommended",
      unitPrice: { numerator: 1_600_000_000n, denominator: 1000n },
    });
  });

  it("prices a component sold by the unit by the whole units the recipe uses", () => {
    const recommendation = recommendedUnitPrice(
      [{ componentProductId: "jar", quantityPerOutputUnit: 2000 }],
      new Map([["jar", 350]]),
    );

    expect(recommendation.kind === "recommended" && roundHalfUp(recommendation.unitPrice)).toBe(
      700,
    );
  });

  it("keeps the exact fraction so rounding happens only when the caller rounds", () => {
    const recommendation = recommendedUnitPrice(
      [{ componentProductId: ALMONDS, quantityPerOutputUnit: 1 }],
      new Map([[ALMONDS, 1500]]),
    );

    expect(recommendation).toEqual({
      kind: "recommended",
      unitPrice: { numerator: 1500n, denominator: 1000n },
    });
    expect(recommendation.kind === "recommended" && roundHalfUp(recommendation.unitPrice)).toBe(2);
  });

  it("names the components without a current price, in the recipe's order", () => {
    const recommendation = recommendedUnitPrice(
      [
        { componentProductId: "c", quantityPerOutputUnit: 100 },
        { componentProductId: ALMONDS, quantityPerOutputUnit: 100 },
        { componentProductId: "b", quantityPerOutputUnit: 100 },
      ],
      new Map([[ALMONDS, 1000]]),
    );

    expect(recommendation).toEqual({ kind: "missing_prices", componentProductIds: ["c", "b"] });
  });

  it("sums to zero for a recipe with no components", () => {
    expect(recommendedUnitPrice([], new Map())).toEqual({
      kind: "recommended",
      unitPrice: { numerator: 0n, denominator: 1000n },
    });
  });

  it("matches the sum of price times quantity for any recipe whose components are all priced", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.record({
            componentProductId: fc.uuid(),
            quantityPerOutputUnit: fc.integer({ min: 1, max: 5_000_000 }),
            price: fc.integer({ min: 1, max: 2_147_483_647 }),
          }),
          { selector: ({ componentProductId }) => componentProductId, maxLength: 8 },
        ),
        (rows) => {
          const recommendation = recommendedUnitPrice(
            rows,
            new Map(rows.map(({ componentProductId, price }) => [componentProductId, price])),
          );

          const expected = rows.reduce(
            (total, { quantityPerOutputUnit, price }) =>
              total + BigInt(price) * BigInt(quantityPerOutputUnit),
            0n,
          );
          expect(recommendation).toEqual({
            kind: "recommended",
            unitPrice: { numerator: expected, denominator: 1000n },
          });
        },
      ),
    );
  });

  it("reports exactly the unpriced components for any recipe", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.record({
            componentProductId: fc.uuid(),
            quantityPerOutputUnit: fc.integer({ min: 1, max: 5_000_000 }),
            priced: fc.boolean(),
          }),
          { selector: ({ componentProductId }) => componentProductId, maxLength: 8 },
        ),
        (rows) => {
          const recommendation = recommendedUnitPrice(
            rows,
            new Map(
              rows
                .filter(({ priced }) => priced)
                .map(({ componentProductId }) => [componentProductId, 100]),
            ),
          );

          const missing = rows
            .filter(({ priced }) => !priced)
            .map(({ componentProductId }) => componentProductId);
          expect(recommendation.kind).toBe(missing.length === 0 ? "recommended" : "missing_prices");
          if (recommendation.kind === "missing_prices") {
            expect(recommendation.componentProductIds).toEqual(missing);
          }
        },
      ),
    );
  });
});
