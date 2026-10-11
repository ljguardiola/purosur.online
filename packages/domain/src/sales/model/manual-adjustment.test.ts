import { describe, expect, it } from "vitest";
import { MAX_UNIT_PRICE_CENTS } from "../../pricing/index.js";
import {
  manualAdjustmentReason,
  mayBeManualDiscountAmount,
  mayBeManualDiscountPercent,
  mayBeOverriddenUnitPrice,
} from "./manual-adjustment.js";

describe("mayBeManualDiscountPercent", () => {
  it.each([1, 50, 100])("accepts %s", (percent) => {
    expect(mayBeManualDiscountPercent(percent)).toBe(true);
  });

  it.each([0, -1, 101, 12.5, Number.NaN, Number.POSITIVE_INFINITY])("refuses %s", (percent) => {
    expect(mayBeManualDiscountPercent(percent)).toBe(false);
  });
});

describe("mayBeManualDiscountAmount", () => {
  it.each([1, 250, Number.MAX_SAFE_INTEGER])("accepts %s", (amount) => {
    expect(mayBeManualDiscountAmount(amount)).toBe(true);
  });

  it.each([0, -1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])("refuses %s", (amount) => {
    expect(mayBeManualDiscountAmount(amount)).toBe(false);
  });
});

describe("mayBeOverriddenUnitPrice", () => {
  it.each([0, 1, 2500, MAX_UNIT_PRICE_CENTS])("accepts %s", (unitPrice) => {
    expect(mayBeOverriddenUnitPrice(unitPrice)).toBe(true);
  });

  it.each([-1, MAX_UNIT_PRICE_CENTS + 1, 10.5, Number.NaN])("refuses %s", (unitPrice) => {
    expect(mayBeOverriddenUnitPrice(unitPrice)).toBe(false);
  });
});

describe("manualAdjustmentReason", () => {
  it("keeps the reason without the spaces around it", () => {
    expect(manualAdjustmentReason("  cliente de la casa \n")).toBe("cliente de la casa");
  });

  it("refuses a reason that is empty once trimmed", () => {
    expect(manualAdjustmentReason("")).toBeUndefined();
    expect(manualAdjustmentReason(" \t\n ")).toBeUndefined();
  });

  it("sets no limit on the length", () => {
    const long = "a".repeat(5000);
    expect(manualAdjustmentReason(long)).toBe(long);
  });
});
