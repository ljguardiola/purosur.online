import { describe, expect, it } from "vitest";
import {
  expectedOrderTotal,
  mayBeCancelled,
  mayBeEdited,
  PURCHASE_ORDER_STATES,
} from "./purchase-order.js";

describe("PURCHASE_ORDER_STATES", () => {
  it("names the states an order can be in", () => {
    expect(PURCHASE_ORDER_STATES).toEqual(["DRAFT", "CANCELLED"]);
  });
});

describe("mayBeEdited", () => {
  it("allows editing a draft only", () => {
    expect(mayBeEdited("DRAFT")).toBe(true);
    expect(mayBeEdited("CANCELLED")).toBe(false);
  });
});

describe("mayBeCancelled", () => {
  it("allows cancelling a draft but not an order already cancelled", () => {
    expect(mayBeCancelled("DRAFT")).toBe(true);
    expect(mayBeCancelled("CANCELLED")).toBe(false);
  });
});

describe("expectedOrderTotal", () => {
  it("adds the packages times the expected price of every line that has one", () => {
    expect(
      expectedOrderTotal([
        { packages: 3, expectedPackagePriceCents: 1_250 },
        { packages: 2, expectedPackagePriceCents: 400 },
      ]),
    ).toEqual({ expectedTotalCents: 4_550, hasUnpricedLine: false });
  });

  it("leaves a line without a price out of the total and tells there is one", () => {
    expect(
      expectedOrderTotal([
        { packages: 3, expectedPackagePriceCents: 1_250 },
        { packages: 5, expectedPackagePriceCents: null },
      ]),
    ).toEqual({ expectedTotalCents: 3_750, hasUnpricedLine: true });
  });

  it("is zero with nothing to add", () => {
    expect(expectedOrderTotal([])).toEqual({ expectedTotalCents: 0, hasUnpricedLine: false });
    expect(expectedOrderTotal([{ packages: 1, expectedPackagePriceCents: null }])).toEqual({
      expectedTotalCents: 0,
      hasUnpricedLine: true,
    });
  });
});
