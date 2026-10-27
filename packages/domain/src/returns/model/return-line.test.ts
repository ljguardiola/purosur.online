import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { lineRefundAmount, mustBeReturnedWhole, returnableQuantity } from "./return-line.js";

describe("returnableQuantity", () => {
  it("is what the line sold minus what was already returned from it", () => {
    expect(returnableQuantity({ soldQuantity: 5, returnedQuantity: 2 })).toBe(3);
    expect(returnableQuantity({ soldQuantity: 1250, returnedQuantity: 0 })).toBe(1250);
  });

  it("is nothing once everything was returned", () => {
    expect(returnableQuantity({ soldQuantity: 5, returnedQuantity: 5 })).toBe(0);
  });

  it("is never negative", () => {
    fc.assert(
      fc.property(fc.nat(10_000), fc.nat(10_000), (soldQuantity, returnedQuantity) => {
        expect(returnableQuantity({ soldQuantity, returnedQuantity })).toBeGreaterThanOrEqual(0);
      }),
    );
  });
});

describe("mustBeReturnedWhole", () => {
  it("is true for a line sold under a promotion", () => {
    expect(mustBeReturnedWhole({ promotionId: "ten" })).toBe(true);
  });

  it("is false for a line sold without one", () => {
    expect(mustBeReturnedWhole({ promotionId: null })).toBe(false);
  });
});

describe("lineRefundAmount", () => {
  const LINE = { soldQuantity: 3, chargedAmount: 1000, returnedQuantity: 0, refundedAmount: 0 };

  it("refunds the returned share of what the line actually charged", () => {
    expect(lineRefundAmount({ ...LINE, soldQuantity: 4, chargedAmount: 2000 }, 1)).toBe(500);
  });

  it("rounds half up", () => {
    expect(lineRefundAmount({ ...LINE, soldQuantity: 2, chargedAmount: 1005 }, 1)).toBe(503);
    expect(lineRefundAmount(LINE, 1)).toBe(333);
    expect(lineRefundAmount(LINE, 2)).toBe(667);
  });

  it("refunds the whole charge when the whole quantity comes back", () => {
    expect(lineRefundAmount(LINE, 3)).toBe(1000);
  });

  it("counts what earlier returns of the line already took out", () => {
    const afterFirst = { ...LINE, returnedQuantity: 1, refundedAmount: 333 };

    expect(lineRefundAmount(afterFirst, 1)).toBe(334);
    expect(lineRefundAmount(afterFirst, 2)).toBe(667);
  });

  it("leaves the last unit with whatever the rounding left unrefunded", () => {
    const afterTwo = { ...LINE, returnedQuantity: 2, refundedAmount: 667 };

    expect(lineRefundAmount(afterTwo, 1)).toBe(333);
  });

  it("refunds a weighed line in proportion to the weight returned", () => {
    const cheese = {
      soldQuantity: 1250,
      chargedAmount: 10_000,
      returnedQuantity: 0,
      refundedAmount: 0,
    };

    expect(lineRefundAmount(cheese, 250)).toBe(2000);
  });

  it("refunds nothing for a line that charged nothing", () => {
    expect(lineRefundAmount({ ...LINE, chargedAmount: 0 }, 2)).toBe(0);
  });

  it("never refunds a negative amount, and over several returns never refunds more than the line charged", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5000 }),
        fc.integer({ min: 0, max: 50_000_000 }),
        fc.array(fc.nat(5000), { maxLength: 8 }),
        (soldQuantity, chargedAmount, cuts) => {
          const boundaries = [
            ...new Set([...cuts.map((cut) => cut % (soldQuantity + 1)), soldQuantity]),
          ].sort((a, b) => a - b);
          let returnedQuantity = 0;
          let refundedAmount = 0;
          for (const boundary of boundaries) {
            const quantity = boundary - returnedQuantity;
            if (quantity === 0) {
              continue;
            }
            const refund = lineRefundAmount(
              { soldQuantity, chargedAmount, returnedQuantity, refundedAmount },
              quantity,
            );

            expect(refund).toBeGreaterThanOrEqual(0);
            returnedQuantity += quantity;
            refundedAmount += refund;
            expect(refundedAmount).toBeLessThanOrEqual(chargedAmount);
          }

          expect(returnedQuantity).toBe(soldQuantity);
          expect(refundedAmount).toBe(chargedAmount);
        },
      ),
    );
  });
});
