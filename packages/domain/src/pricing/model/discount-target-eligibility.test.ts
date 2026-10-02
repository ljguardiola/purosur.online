import { describe, expect, it } from "vitest";
import type { DiscountBenefit } from "./discount-benefit.js";
import {
  type AssignableTargetCandidate,
  isAssignableTarget,
  isTargetKindAllowedFor,
  targetAcceptsBenefit,
} from "./discount-target-eligibility.js";

const PERCENT_OFF: DiscountBenefit["kind"] = "PERCENT_OFF";
const BUY_N_PAY_M: DiscountBenefit["kind"] = "BUY_N_PAY_M";

describe("isTargetKindAllowedFor", () => {
  it.each(["PRODUCT", "CATEGORY", "TAG"] as const)("lets a percent off target a %s", (kind) => {
    expect(isTargetKindAllowedFor(PERCENT_OFF, kind)).toBe(true);
  });

  it("lets buy N pay M target a product", () => {
    expect(isTargetKindAllowedFor(BUY_N_PAY_M, "PRODUCT")).toBe(true);
  });

  it.each(["CATEGORY", "TAG"] as const)("keeps buy N pay M off a %s", (kind) => {
    expect(isTargetKindAllowedFor(BUY_N_PAY_M, kind)).toBe(false);
  });
});

describe("isAssignableTarget", () => {
  it.each([true, false])("follows a product's active flag (%j)", (active) => {
    expect(isAssignableTarget({ kind: "PRODUCT", active, saleUnit: "UNIT" })).toBe(active);
  });

  it.each([true, false])("follows a tag's active flag (%j)", (active) => {
    expect(isAssignableTarget({ kind: "TAG", active })).toBe(active);
  });

  it("accepts any category", () => {
    expect(isAssignableTarget({ kind: "CATEGORY" })).toBe(true);
  });
});

describe("targetAcceptsBenefit", () => {
  const unitProduct: AssignableTargetCandidate = {
    kind: "PRODUCT",
    active: true,
    saleUnit: "UNIT",
  };
  const weighedProduct: AssignableTargetCandidate = {
    kind: "PRODUCT",
    active: true,
    saleUnit: "KG",
  };

  it("accepts a percent off on every kind of target", () => {
    expect(targetAcceptsBenefit(unitProduct, PERCENT_OFF)).toBe(true);
    expect(targetAcceptsBenefit(weighedProduct, PERCENT_OFF)).toBe(true);
    expect(targetAcceptsBenefit({ kind: "TAG", active: true }, PERCENT_OFF)).toBe(true);
    expect(targetAcceptsBenefit({ kind: "CATEGORY" }, PERCENT_OFF)).toBe(true);
  });

  it("accepts buy N pay M on a product sold by unit", () => {
    expect(targetAcceptsBenefit(unitProduct, BUY_N_PAY_M)).toBe(true);
  });

  it("refuses buy N pay M on a product sold by weight", () => {
    expect(targetAcceptsBenefit(weighedProduct, BUY_N_PAY_M)).toBe(false);
  });

  it("refuses buy N pay M on a tag and on a category", () => {
    expect(targetAcceptsBenefit({ kind: "TAG", active: true }, BUY_N_PAY_M)).toBe(false);
    expect(targetAcceptsBenefit({ kind: "CATEGORY" }, BUY_N_PAY_M)).toBe(false);
  });
});
