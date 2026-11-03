import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { roundHalfUp } from "../../shared/index.js";
import { lineValue } from "./purchase-line.js";
import {
  missingQuantity,
  outstandingQuantity,
  priceDifferenceCents,
  stateAfterReceipt,
} from "./purchase-order-receipt.js";

const quantity = fc.integer({ min: 0, max: 1_000_000 });

describe("outstandingQuantity", () => {
  it("is what the order asked for less what earlier receipts brought", () => {
    expect(outstandingQuantity({ packages: 3, quantityPerPackage: 12_000 }, 10_000)).toBe(26_000);
    expect(outstandingQuantity({ packages: 3, quantityPerPackage: 12_000 }, 0)).toBe(36_000);
  });

  it("is zero once the order's quantity has arrived or been exceeded", () => {
    expect(outstandingQuantity({ packages: 1, quantityPerPackage: 5_000 }, 5_000)).toBe(0);
    expect(outstandingQuantity({ packages: 1, quantityPerPackage: 5_000 }, 7_000)).toBe(0);
  });

  it("is never negative", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000 }), quantity, quantity, (packages, per, got) => {
        expect(
          outstandingQuantity({ packages, quantityPerPackage: per }, got),
        ).toBeGreaterThanOrEqual(0);
      }),
    );
  });
});

describe("missingQuantity", () => {
  it("is what is still outstanding after the delivery", () => {
    expect(missingQuantity(10_000, 4_000)).toBe(6_000);
    expect(missingQuantity(10_000, 10_000)).toBe(0);
  });

  it("is zero for an over-delivery", () => {
    expect(missingQuantity(10_000, 12_000)).toBe(0);
  });

  it("is never negative", () => {
    fc.assert(
      fc.property(quantity, quantity, (outstanding, received) => {
        expect(missingQuantity(outstanding, received)).toBeGreaterThanOrEqual(0);
      }),
    );
  });
});

describe("priceDifferenceCents", () => {
  const list = { numerator: 250n, denominator: 1n };
  const dozen = (costPaidCents: number, quantity = 12_000) => ({
    costPaidCents,
    quantity,
    quantityPerPackage: 12_000,
  });

  it("is positive when more was paid than the list price for what arrived", () => {
    expect(priceDifferenceCents([dozen(3_300)], list)).toBe(300);
  });

  it("is negative when less was paid than the list price", () => {
    expect(priceDifferenceCents([dozen(2_900)], list)).toBe(-100);
  });

  it("is zero when exactly the list price was paid", () => {
    expect(priceDifferenceCents([dozen(3_000)], list)).toBe(0);
  });

  it("compares only the quantity that arrived", () => {
    expect(priceDifferenceCents([dozen(1_650, 6_000)], list)).toBe(150);
  });

  it("adds up several lines of the same product", () => {
    expect(priceDifferenceCents([dozen(3_100), dozen(3_200)], list)).toBe(300);
  });

  it("rounds the exact difference half up to a cent", () => {
    const halfCent = { numerator: 1n, denominator: 2n };
    const oneUnit = (costPaidCents: number) => ({
      costPaidCents,
      quantity: 1_000,
      quantityPerPackage: 1_000,
    });
    expect(priceDifferenceCents([oneUnit(1)], halfCent)).toBe(1);
    expect(priceDifferenceCents([oneUnit(0)], halfCent)).toBe(0);
    expect(priceDifferenceCents([oneUnit(10)], { numerator: 10n, denominator: 3n })).toBe(7);
  });

  it("has no difference without a list price", () => {
    expect(priceDifferenceCents([dozen(3_300)], null)).toBeNull();
  });

  it("has no difference when nothing arrived", () => {
    expect(priceDifferenceCents([], list)).toBeNull();
    expect(priceDifferenceCents([dozen(3_300, 0)], list)).toBeNull();
  });

  it("is zero whenever the line pays exactly the list price for its quantity", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 1, max: 1_000 }),
        (perUnitCents, units) => {
          const quantity = units * 1_000;
          expect(
            priceDifferenceCents(
              [{ costPaidCents: perUnitCents * units, quantity, quantityPerPackage: quantity }],
              { numerator: BigInt(perUnitCents), denominator: 1n },
            ),
          ).toBe(0);
        },
      ),
    );
  });

  it("agrees with the rounded difference between what was paid and the list value", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 1, max: 10_000 }),
        (costPaidCents, received, perPackage, listCents) => {
          const line = { costPaidCents, quantity: received, quantityPerPackage: perPackage };
          const paid = lineValue(line);
          const expected = roundHalfUp({
            numerator:
              paid.numerator * 1_000n - BigInt(listCents) * BigInt(received) * paid.denominator,
            denominator: paid.denominator * 1_000n,
          });
          expect(
            priceDifferenceCents([line], { numerator: BigInt(listCents), denominator: 1n }),
          ).toBe(expected);
        },
      ),
    );
  });
});

describe("stateAfterReceipt", () => {
  it("is received when nothing is missing on any line", () => {
    expect(stateAfterReceipt([0, 0, 0])).toBe("RECEIVED");
  });

  it("is partially received when any line is still missing something", () => {
    expect(stateAfterReceipt([0, 1_000, 0])).toBe("PARTIALLY_RECEIVED");
    expect(stateAfterReceipt([5_000])).toBe("PARTIALLY_RECEIVED");
  });
});
