import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MAX_UNIT_PRICE_CENTS } from "../../pricing/index.js";
import { chargeLine } from "./line-pricing.js";
import type { LinePromotion } from "./sale.js";

const TEN_PERCENT: LinePromotion = { id: "ten", benefit: { kind: "PERCENT_OFF", percent: 10 } };
const HALF: LinePromotion = { id: "half", benefit: { kind: "PERCENT_OFF", percent: 50 } };
const THREE_FOR_TWO: LinePromotion = {
  id: "three-for-two",
  benefit: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 },
};

function units(count: number) {
  return { saleUnit: "UNIT", units: count } as const;
}

function weight(thousandths: number) {
  return { saleUnit: "KG", thousandths } as const;
}

describe("chargeLine without promotions", () => {
  it("charges the list amount of a unit line", () => {
    expect(chargeLine(units(2), 2500, [])).toEqual({
      promotionId: null,
      discountAmount: 0,
      lineTotal: 5000,
    });
  });

  it.each([
    [1, 999, 1],
    [500, 999, 500],
    [1, 500, 1],
    [1, 499, 0],
    [3, 500, 2],
    [1250, 9000, 11_250],
    [333, 1000, 333],
  ])(
    "rounds a weight of %s thousandths at %s cents per kg half up to %s",
    (thousandths, price, total) => {
      expect(chargeLine(weight(thousandths), price, []).lineTotal).toBe(total);
    },
  );

  it("does not lose precision at the largest unit price and quantities", () => {
    expect(chargeLine(units(1_000_000), MAX_UNIT_PRICE_CENTS, []).lineTotal).toBe(
      2_147_483_647_000_000,
    );
    expect(chargeLine(weight(1_000_001), MAX_UNIT_PRICE_CENTS, []).lineTotal).toBe(
      2_147_485_794_484,
    );
  });
});

describe("chargeLine with a percentage promotion", () => {
  it("applies the percentage before rounding, not to the rounded amount", () => {
    expect(chargeLine(weight(15), 999, [HALF]).lineTotal).toBe(7);
  });

  it("rounds the discounted total half up on the exact .5 boundary", () => {
    expect(chargeLine(units(1), 5, [HALF])).toEqual({
      promotionId: "half",
      discountAmount: 2,
      lineTotal: 3,
    });
  });

  it("does not carry a promotion whose discount rounds to nothing", () => {
    expect(chargeLine(units(1), 4, [TEN_PERCENT])).toEqual({
      promotionId: null,
      discountAmount: 0,
      lineTotal: 4,
    });
  });
});

describe("chargeLine with a buy N, pay M promotion", () => {
  it("reports the units it does not charge as the discount", () => {
    expect(chargeLine(units(7), 100, [THREE_FOR_TWO])).toEqual({
      promotionId: "three-for-two",
      discountAmount: 200,
      lineTotal: 500,
    });
  });

  it("leaves a line without a complete group without promotion", () => {
    expect(chargeLine(units(2), 100, [THREE_FOR_TWO])).toEqual({
      promotionId: null,
      discountAmount: 0,
      lineTotal: 200,
    });
  });

  it("is ignored for a weight line", () => {
    expect(chargeLine(weight(3000), 100, [THREE_FOR_TWO])).toEqual({
      promotionId: null,
      discountAmount: 0,
      lineTotal: 300,
    });
  });
});

describe("chargeLine choosing among promotions", () => {
  it("picks the promotion giving the larger discount", () => {
    expect(chargeLine(units(3), 1000, [TEN_PERCENT, THREE_FOR_TWO]).promotionId).toBe(
      "three-for-two",
    );
    expect(chargeLine(units(2), 1000, [THREE_FOR_TWO, TEN_PERCENT]).promotionId).toBe("ten");
  });

  it("switches from 10 % to buy 3 pay 2 when the quantity reaches 3", () => {
    const frozen = [TEN_PERCENT, THREE_FOR_TWO];

    expect([1, 2, 3].map((count) => chargeLine(units(count), 1000, frozen).promotionId)).toEqual([
      "ten",
      "ten",
      "three-for-two",
    ]);
  });

  it("breaks a tie with the lower identifier whatever the order", () => {
    const b: LinePromotion = { id: "b", benefit: { kind: "PERCENT_OFF", percent: 20 } };
    const a: LinePromotion = { id: "a", benefit: { kind: "PERCENT_OFF", percent: 20 } };

    expect(chargeLine(units(1), 1000, [b, a]).promotionId).toBe("a");
    expect(chargeLine(units(1), 1000, [a, b]).promotionId).toBe("a");
  });

  it("keeps the larger discount over a lower identifier giving less", () => {
    const b: LinePromotion = { id: "b", benefit: { kind: "PERCENT_OFF", percent: 20 } };
    const a: LinePromotion = { id: "a", benefit: { kind: "PERCENT_OFF", percent: 10 } };

    expect(chargeLine(units(1), 1000, [b, a]).promotionId).toBe("b");
  });

  it("compares identifiers as strings", () => {
    const ten: LinePromotion = { id: "10", benefit: { kind: "PERCENT_OFF", percent: 20 } };
    const nine: LinePromotion = { id: "9", benefit: { kind: "PERCENT_OFF", percent: 20 } };

    expect(chargeLine(units(1), 1000, [nine, ten]).promotionId).toBe("10");
  });

  it("compares identifiers by their characters, not by any language's alphabetical order", () => {
    const lower: LinePromotion = { id: "a", benefit: { kind: "PERCENT_OFF", percent: 20 } };
    const upper: LinePromotion = { id: "B", benefit: { kind: "PERCENT_OFF", percent: 20 } };

    expect(chargeLine(units(1), 1000, [lower, upper]).promotionId).toBe("B");
  });

  it("ignores a buy N, pay M offer beside a percentage on a weight line", () => {
    expect(chargeLine(weight(3000), 1000, [THREE_FOR_TWO, TEN_PERCENT]).promotionId).toBe("ten");
  });
});

describe("chargeLine with a manual adjustment", () => {
  it("charges an overridden price below the list price with no discount of its own", () => {
    expect(chargeLine(units(2), 2500, [], { kind: "PRICE", unitPrice: 2000 })).toEqual({
      promotionId: null,
      discountAmount: 0,
      lineTotal: 4000,
    });
  });

  it("charges an overridden price above the list price with no discount", () => {
    expect(chargeLine(units(2), 2500, [], { kind: "PRICE", unitPrice: 3000 })).toEqual({
      promotionId: null,
      discountAmount: 0,
      lineTotal: 6000,
    });
  });

  it("charges nothing for an overridden price of zero", () => {
    expect(chargeLine(units(3), 2500, [], { kind: "PRICE", unitPrice: 0 })).toEqual({
      promotionId: null,
      discountAmount: 0,
      lineTotal: 0,
    });
  });

  it("rounds an overridden price on a weighed line half up", () => {
    expect(chargeLine(weight(1500), 999, [], { kind: "PRICE", unitPrice: 333 }).lineTotal).toBe(
      500,
    );
  });

  it("applies a percentage before rounding, not to the rounded amount", () => {
    expect(chargeLine(weight(15), 999, [], { kind: "PERCENT", percent: 50 })).toEqual({
      promotionId: null,
      discountAmount: 7,
      lineTotal: 7,
    });
  });

  it("takes a percentage off the list amount of a unit line", () => {
    expect(chargeLine(units(3), 2500, [], { kind: "PERCENT", percent: 15 })).toEqual({
      promotionId: null,
      discountAmount: 1125,
      lineTotal: 6375,
    });
  });

  it("charges nothing for a percentage of 100", () => {
    expect(chargeLine(units(3), 2500, [], { kind: "PERCENT", percent: 100 })).toEqual({
      promotionId: null,
      discountAmount: 7500,
      lineTotal: 0,
    });
  });

  it("takes a fixed amount off the gross amount", () => {
    expect(chargeLine(units(3), 2500, [], { kind: "AMOUNT", amount: 1000 })).toEqual({
      promotionId: null,
      discountAmount: 1000,
      lineTotal: 6500,
    });
  });

  it("charges nothing for an amount equal to the gross amount", () => {
    expect(chargeLine(units(3), 2500, [], { kind: "AMOUNT", amount: 7500 })).toEqual({
      promotionId: null,
      discountAmount: 7500,
      lineTotal: 0,
    });
  });

  it.each([
    { kind: "PRICE", unitPrice: 2400 },
    { kind: "PERCENT", percent: 5 },
    { kind: "AMOUNT", amount: 10 },
  ] as const)(
    "replaces the promotion with a $kind adjustment instead of adding to it",
    (adjustment) => {
      const withPromotion = chargeLine(units(3), 2500, [HALF, TEN_PERCENT]);
      const adjusted = chargeLine(units(3), 2500, [HALF, TEN_PERCENT], adjustment);

      expect(withPromotion.promotionId).toBe("half");
      expect(adjusted).toEqual(chargeLine(units(3), 2500, [], adjustment));
      expect(adjusted.promotionId).toBeNull();
    },
  );

  it("never charges a negative total nor a negative discount, whatever the adjustment", () => {
    const quantity = fc.oneof(
      fc.integer({ min: 1, max: 100_000 }).map(units),
      fc.integer({ min: 1, max: 100_000_000 }).map(weight),
    );
    const adjustment = fc.oneof(
      fc
        .integer({ min: 0, max: MAX_UNIT_PRICE_CENTS })
        .map((unitPrice) => ({ kind: "PRICE" as const, unitPrice })),
      fc.integer({ min: 1, max: 100 }).map((percent) => ({ kind: "PERCENT" as const, percent })),
    );
    fc.assert(
      fc.property(
        quantity,
        fc.integer({ min: 0, max: MAX_UNIT_PRICE_CENTS }),
        adjustment,
        (sold, unitPrice, chosen) => {
          const charge = chargeLine(sold, unitPrice, [], chosen);

          expect(charge.lineTotal).toBeGreaterThanOrEqual(0);
          expect(charge.discountAmount).toBeGreaterThanOrEqual(0);
          if (chosen.kind === "PRICE") {
            expect(charge.discountAmount).toBe(0);
          } else {
            const gross = chargeLine(sold, unitPrice, []).lineTotal;
            expect(charge.lineTotal).toBeLessThanOrEqual(gross);
            expect(charge.discountAmount + charge.lineTotal).toBe(gross);
          }
        },
      ),
    );
  });

  it("charges the gross amount less a fixed amount up to the gross, for every amount", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 1, max: MAX_UNIT_PRICE_CENTS }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (count, unitPrice, share) => {
          const gross = chargeLine(units(count), unitPrice, []).lineTotal;
          const amount = Math.max(1, Math.floor(gross * share));

          const charge = chargeLine(units(count), unitPrice, [], { kind: "AMOUNT", amount });

          expect(charge.discountAmount).toBe(amount);
          expect(charge.lineTotal).toBe(gross - amount);
          expect(charge.lineTotal).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });
});
