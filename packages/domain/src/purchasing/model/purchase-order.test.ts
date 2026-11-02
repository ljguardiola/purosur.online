import { describe, expect, it } from "vitest";
import {
  expectedLineTotal,
  expectedOrderTotal,
  mayBeCancelled,
  mayBeEdited,
  mayBeShared,
  PURCHASE_ORDER_STATES,
} from "./purchase-order.js";

describe("PURCHASE_ORDER_STATES", () => {
  it("names the states an order can be in", () => {
    expect(PURCHASE_ORDER_STATES).toEqual(["DRAFT", "SENT", "CANCELLED"]);
  });
});

describe("mayBeEdited", () => {
  it("allows editing a draft only", () => {
    expect(mayBeEdited("DRAFT")).toBe(true);
    expect(mayBeEdited("SENT")).toBe(false);
    expect(mayBeEdited("CANCELLED")).toBe(false);
  });
});

describe("mayBeShared", () => {
  it("allows sharing a draft only", () => {
    expect(mayBeShared("DRAFT")).toBe(true);
    expect(mayBeShared("SENT")).toBe(false);
    expect(mayBeShared("CANCELLED")).toBe(false);
  });
});

describe("mayBeCancelled", () => {
  it("allows cancelling a draft or a sent order but not one already cancelled", () => {
    expect(mayBeCancelled("DRAFT")).toBe(true);
    expect(mayBeCancelled("SENT")).toBe(true);
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

describe("expectedLineTotal", () => {
  it("multiplies the packages by the expected package price", () => {
    expect(expectedLineTotal({ packages: 3, expectedPackagePriceCents: 1_250 })).toBe(3_750);
  });

  it("has no total for a line without a price", () => {
    expect(expectedLineTotal({ packages: 3, expectedPackagePriceCents: null })).toBeNull();
  });
});
