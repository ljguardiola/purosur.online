import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MAX_UNIT_PRICE_CENTS } from "../../pricing/index.js";
import { chargeLine, lineAmount } from "./line-pricing.js";
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

describe("lineAmount", () => {
  it("is the units times the unit price for a unit line", () => {
    expect(lineAmount(units(3), 2500)).toEqual({ numerator: 7500n, denominator: 1n });
  });

  it("is the thousandths of a kilogram times the price per kilogram, over 1000, for a weight line", () => {
    expect(lineAmount(weight(1250), 9000)).toEqual({ numerator: 11_250_000n, denominator: 1000n });
  });
});

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
  it("takes the percentage off the exact amount of a unit line", () => {
    expect(chargeLine(units(2), 2500, [TEN_PERCENT])).toEqual({
      promotionId: "ten",
      discountAmount: 500,
      lineTotal: 4500,
    });
  });

  it("applies the percentage before rounding, not to the rounded amount", () => {
    expect(chargeLine(weight(15), 999, [HALF]).lineTotal).toBe(7);
  });

  it("charges a weight line with the same calculation", () => {
    expect(chargeLine(weight(1250), 9000, [TEN_PERCENT])).toEqual({
      promotionId: "ten",
      discountAmount: 1125,
      lineTotal: 10_125,
    });
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

  it("charges nothing at 100 % off", () => {
    const free: LinePromotion = { id: "free", benefit: { kind: "PERCENT_OFF", percent: 100 } };

    expect(chargeLine(units(3), 2500, [free])).toEqual({
      promotionId: "free",
      discountAmount: 7500,
      lineTotal: 0,
    });
  });

  it("never charges more than the list amount nor a negative total", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_UNIT_PRICE_CENTS }),
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 1, max: 100 }),
        (price, thousandths, percent) => {
          const promotion: LinePromotion = { id: "p", benefit: { kind: "PERCENT_OFF", percent } };
          const listed = chargeLine(weight(thousandths), price, []).lineTotal;

          const charged = chargeLine(weight(thousandths), price, [promotion]);

          expect(charged.lineTotal).toBeGreaterThanOrEqual(0);
          expect(charged.lineTotal).toBeLessThanOrEqual(listed);
          expect(charged.discountAmount).toBe(listed - charged.lineTotal);
        },
      ),
    );
  });

  it("matches the exact rational calculation for every price, weight and percentage", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_UNIT_PRICE_CENTS }),
        fc.integer({ min: 1, max: 100_000_000 }),
        fc.integer({ min: 1, max: 100 }),
        (price, thousandths, percent) => {
          const promotion: LinePromotion = { id: "p", benefit: { kind: "PERCENT_OFF", percent } };
          const numerator = BigInt(thousandths) * BigInt(price) * BigInt(100 - percent);
          const denominator = 100_000n;
          const expected = (2n * numerator + denominator) / (2n * denominator);

          const { lineTotal } = chargeLine(weight(thousandths), price, [promotion]);

          expect(BigInt(lineTotal)).toBe(expected);
        },
      ),
    );
  });
});

describe("chargeLine with a buy N, pay M promotion", () => {
  it.each([
    [1, 1],
    [2, 2],
    [3, 2],
    [4, 3],
    [5, 4],
    [6, 4],
    [7, 5],
  ])("charges %s units as %s", (count, charged) => {
    expect(chargeLine(units(count), 100, [THREE_FOR_TWO]).lineTotal).toBe(charged * 100);
  });

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

  it("does not lose precision with the largest price and many groups", () => {
    expect(chargeLine(units(30_000), MAX_UNIT_PRICE_CENTS, [THREE_FOR_TWO]).lineTotal).toBe(
      20_000 * MAX_UNIT_PRICE_CENTS,
    );
  });

  it("charges for every quantity what the groups and the leftover units add up to", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 20 }),
        fc.integer({ min: 1, max: 19 }),
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 0, max: MAX_UNIT_PRICE_CENTS }),
        (buyQty, requestedPayQty, count, price) => {
          const payQty = Math.min(requestedPayQty, buyQty - 1);
          const promotion: LinePromotion = {
            id: "p",
            benefit: { kind: "BUY_N_PAY_M", buyQty, payQty },
          };
          const chargedUnits = Math.floor(count / buyQty) * payQty + (count % buyQty);

          expect(chargeLine(units(count), price, [promotion]).lineTotal).toBe(chargedUnits * price);
        },
      ),
    );
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

  it("compares identifiers as strings", () => {
    const ten: LinePromotion = { id: "10", benefit: { kind: "PERCENT_OFF", percent: 20 } };
    const nine: LinePromotion = { id: "9", benefit: { kind: "PERCENT_OFF", percent: 20 } };

    expect(chargeLine(units(1), 1000, [nine, ten]).promotionId).toBe("10");
  });

  it("ignores a buy N, pay M offer beside a percentage on a weight line", () => {
    expect(chargeLine(weight(3000), 1000, [THREE_FOR_TWO, TEN_PERCENT]).promotionId).toBe("ten");
  });
});
