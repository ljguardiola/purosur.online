import { describe, expect, test } from "vitest";
import { lineTotalCents, orderTotalOf } from "./purchase-order-totals";
import { DRAFT_ORDER } from "./test-support/purchase-orders";

const [priced, unpriced] = DRAFT_ORDER.lines;
if (!priced || !unpriced) {
  throw new Error("The fixture has two lines");
}

describe("lineTotalCents", () => {
  test("is the packages times the expected package price", () => {
    expect(lineTotalCents(priced)).toBe(555_000);
  });

  test("is unknown for a line without a list price", () => {
    expect(lineTotalCents(unpriced)).toBeNull();
  });
});

describe("orderTotalOf", () => {
  test("adds the priced lines and says a line has no price", () => {
    expect(orderTotalOf(DRAFT_ORDER.lines)).toEqual({ cents: 555_000, hasUnpricedLine: true });
  });

  test("has no unpriced line when every line is priced", () => {
    expect(orderTotalOf([priced])).toEqual({ cents: 555_000, hasUnpricedLine: false });
  });

  test("is zero for no lines", () => {
    expect(orderTotalOf([])).toEqual({ cents: 0, hasUnpricedLine: false });
  });
});
