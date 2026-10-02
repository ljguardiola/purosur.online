import { describe, expect, it } from "vitest";
import { DISCOUNT_BENEFIT_KINDS } from "./discount-benefit.js";

describe("DISCOUNT_BENEFIT_KINDS", () => {
  it("lists the benefits a discount can give", () => {
    expect(DISCOUNT_BENEFIT_KINDS).toEqual(["PERCENT_OFF", "BUY_N_PAY_M"]);
  });
});
