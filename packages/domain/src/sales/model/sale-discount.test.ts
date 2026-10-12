import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { SaleLine } from "./sale.js";
import {
  amountToCharge,
  type SaleDiscount,
  saleDiscountAmount,
  saleDiscountRefusal,
  settledLines,
  spreadSaleDiscount,
} from "./sale-discount.js";

const REASON = "cliente frecuente";

function discount(
  value: { kind: "PERCENT"; percent: number } | { kind: "AMOUNT"; amount: number },
) {
  return { ...value, reason: REASON, authorizedBy: null } satisfies SaleDiscount;
}

function line(id: string, lineTotal: number): SaleLine {
  return {
    id,
    productId: `product-${id}`,
    productName: `Product ${id}`,
    saleUnit: "UNIT",
    weightSource: null,
    quantity: 1,
    listUnitPrice: lineTotal,
    priceListId: "list-1",
    promotions: [],
    manualAdjustment: null,
    promotionId: null,
    discountAmount: 0,
    lineTotal,
  };
}

describe("saleDiscountAmount", () => {
  it.each([
    [10_000, 10, 1000],
    [999, 10, 100],
    [995, 10, 100],
    [994, 10, 99],
    [1, 50, 1],
    [0, 50, 0],
    [12_345, 100, 12_345],
  ])("takes %s cents off by %s percent, rounded half up, as %s", (subtotal, percent, expected) => {
    expect(saleDiscountAmount(subtotal, discount({ kind: "PERCENT", percent }))).toBe(expected);
  });

  it("takes a fixed amount as it is", () => {
    expect(saleDiscountAmount(10_000, discount({ kind: "AMOUNT", amount: 2500 }))).toBe(2500);
  });

  it("never exceeds the subtotal for a percentage", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
        fc.integer({ min: 1, max: 100 }),
        (subtotal, percent) => {
          const amount = saleDiscountAmount(subtotal, discount({ kind: "PERCENT", percent }));
          expect(amount).toBeGreaterThanOrEqual(0);
          expect(amount).toBeLessThanOrEqual(subtotal);
        },
      ),
    );
  });
});

describe("saleDiscountRefusal", () => {
  it("accepts a percentage and an amount up to the subtotal", () => {
    const lines = [line("a", 600), line("b", 400)];

    expect(saleDiscountRefusal(lines, discount({ kind: "PERCENT", percent: 100 }))).toBeUndefined();
    expect(saleDiscountRefusal(lines, discount({ kind: "AMOUNT", amount: 1000 }))).toBeUndefined();
    expect(saleDiscountRefusal(lines, discount({ kind: "AMOUNT", amount: 1 }))).toBeUndefined();
  });

  it("refuses an amount above the sum of the line subtotals", () => {
    expect(
      saleDiscountRefusal(
        [line("a", 600), line("b", 400)],
        discount({ kind: "AMOUNT", amount: 1001 }),
      ),
    ).toEqual({ kind: "discount_exceeds_sale" });
  });

  it("refuses a sale with no lines", () => {
    expect(saleDiscountRefusal([], discount({ kind: "PERCENT", percent: 10 }))).toEqual({
      kind: "empty_sale",
    });
    expect(saleDiscountRefusal([], discount({ kind: "AMOUNT", amount: 10 }))).toEqual({
      kind: "empty_sale",
    });
  });

  it("refuses a sale whose lines add up to nothing", () => {
    expect(saleDiscountRefusal([line("a", 0)], discount({ kind: "PERCENT", percent: 10 }))).toEqual(
      { kind: "zero_total" },
    );
    expect(saleDiscountRefusal([line("a", 0)], discount({ kind: "AMOUNT", amount: 10 }))).toEqual({
      kind: "zero_total",
    });
  });
});

describe("spreadSaleDiscount", () => {
  it("gives the leftover cents of equal lines to the lower positions", () => {
    expect(spreadSaleDiscount([100, 100, 100], 98)).toEqual([33, 33, 32]);
  });

  it("leaves line totals of 67, 67 and 68 for the three-line example", () => {
    const subtotals = [100, 100, 100];
    const shares = spreadSaleDiscount(subtotals, 98);

    expect(subtotals.map((subtotal, index) => subtotal - (shares[index] ?? 0))).toEqual([
      67, 67, 68,
    ]);
  });

  it("gives the leftover cents to the largest fractional remainders", () => {
    expect(spreadSaleDiscount([298, 3], 100)).toEqual([99, 1]);
    expect(spreadSaleDiscount([10, 20, 70], 7)).toEqual([1, 1, 5]);
    expect(spreadSaleDiscount([1, 1, 4], 2)).toEqual([1, 0, 1]);
  });

  it("gives the whole subtotal back when the discount is the whole sale", () => {
    expect(spreadSaleDiscount([120, 0, 355], 475)).toEqual([120, 0, 355]);
  });

  it("spreads nothing when there is nothing to take off", () => {
    expect(spreadSaleDiscount([100, 200], 0)).toEqual([0, 0]);
    expect(spreadSaleDiscount([], 0)).toEqual([]);
    expect(spreadSaleDiscount([0, 0], 0)).toEqual([0, 0]);
  });

  it("never gives a leftover cent to a line without subtotal", () => {
    expect(spreadSaleDiscount([0, 3, 3], 1)).toEqual([0, 1, 0]);
  });

  it("adds up to the discount and keeps every share between zero and its subtotal", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 5_000_000 }), { minLength: 1, maxLength: 12 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (subtotals, fraction) => {
          const sum = subtotals.reduce((total, subtotal) => total + subtotal, 0);
          const amount = Math.round(sum * fraction);

          const shares = spreadSaleDiscount(subtotals, amount);

          expect(shares).toHaveLength(subtotals.length);
          expect(shares.reduce((total, share) => total + share, 0)).toBe(amount);
          shares.forEach((share, index) => {
            expect(share).toBeGreaterThanOrEqual(0);
            expect(share).toBeLessThanOrEqual(subtotals[index] ?? 0);
          });
        },
      ),
    );
  });

  it("stays within one cent of the exact proportional share", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 5_000_000 }), { minLength: 1, maxLength: 12 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (subtotals, fraction) => {
          const sum = subtotals.reduce((total, subtotal) => total + subtotal, 0);
          const amount = Math.round(sum * fraction);

          const shares = spreadSaleDiscount(subtotals, amount);

          shares.forEach((share, index) => {
            const exact = (amount * (subtotals[index] ?? 0)) / sum;
            expect(Math.abs(share - exact)).toBeLessThan(1);
          });
        },
      ),
    );
  });

  it("gives equal lines shares that never grow with the position", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 1, max: 12 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (subtotal, count, fraction) => {
          const amount = Math.round(subtotal * count * fraction);

          const shares = spreadSaleDiscount(Array(count).fill(subtotal), amount);

          shares.slice(1).forEach((share, index) => {
            expect(share).toBeLessThanOrEqual(shares[index] ?? 0);
          });
        },
      ),
    );
  });

  it("gives the leftover cents to the lower position among equal remainders that are not next to each other", () => {
    expect(spreadSaleDiscount([3, 1, 3, 1, 3], 7)).toEqual([2, 1, 2, 0, 2]);
  });

  it("gives lines with the same subtotal shares that never grow with the position", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(1, 2, 3), { minLength: 2, maxLength: 12 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (subtotals, fraction) => {
          const sum = subtotals.reduce((total, subtotal) => total + subtotal, 0);

          const shares = spreadSaleDiscount(subtotals, Math.round(sum * fraction));

          subtotals.forEach((subtotal, earlier) => {
            subtotals.forEach((other, later) => {
              if (earlier < later && subtotal === other) {
                expect(shares[earlier]).toBeGreaterThanOrEqual(shares[later] ?? 0);
              }
            });
          });
        },
      ),
    );
  });

  it("does not lose cents on subtotals whose products exceed the safe integer range", () => {
    const shares = spreadSaleDiscount([9_007_199_254_740_000, 991], 9_007_199_254_740_990);

    expect(shares.reduce((total, share) => total + share, 0)).toBe(9_007_199_254_740_990);
  });
});

describe("amountToCharge", () => {
  const lines = [line("a", 6750), line("b", 1200)];

  it("is the sum of the line totals when the sale has no discount", () => {
    expect(amountToCharge({ lines, saleDiscount: null })).toBe(7950);
  });

  it("takes the percentage discount off the sum of the line totals", () => {
    expect(
      amountToCharge({ lines, saleDiscount: discount({ kind: "PERCENT", percent: 10 }) }),
    ).toBe(7155);
  });

  it("takes the fixed discount off the sum of the line totals", () => {
    expect(amountToCharge({ lines, saleDiscount: discount({ kind: "AMOUNT", amount: 950 }) })).toBe(
      7000,
    );
  });
});

describe("settledLines", () => {
  it("leaves the lines as they are, with no share, when the sale has no discount", () => {
    const lines = [line("a", 100), line("b", 98)];

    expect(settledLines({ lines, saleDiscount: null })).toEqual(
      lines.map((each) => ({ ...each, saleDiscountShare: 0 })),
    );
  });

  it("takes each line's share off its total so the totals add up to the amount to charge", () => {
    const sale = {
      lines: [line("a", 100), line("b", 100), line("c", 100)],
      saleDiscount: discount({ kind: "AMOUNT", amount: 98 }),
    };

    const settled = settledLines(sale);

    expect(settled.map(({ saleDiscountShare }) => saleDiscountShare)).toEqual([33, 33, 32]);
    expect(settled.map(({ lineTotal }) => lineTotal)).toEqual([67, 67, 68]);
    expect(settled.reduce((total, { lineTotal }) => total + lineTotal, 0)).toBe(
      amountToCharge(sale),
    );
  });

  it("keeps the rest of every line", () => {
    const [settled] = settledLines({
      lines: [line("a", 1000)],
      saleDiscount: discount({ kind: "PERCENT", percent: 10 }),
    });

    expect(settled).toEqual({ ...line("a", 1000), lineTotal: 900, saleDiscountShare: 100 });
  });
});
