import { describe, expect, it } from "vitest";
import { DISCOUNT_TARGET_KINDS } from "./discount-target.js";

describe("DISCOUNT_TARGET_KINDS", () => {
  it("lists what a discount can apply to", () => {
    expect(DISCOUNT_TARGET_KINDS).toEqual(["PRODUCT", "CATEGORY", "TAG"]);
  });
});
