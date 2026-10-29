import { describe, expect, it } from "vitest";
import { cancelledBeforeCharge } from "./cancelled-before-charge.js";

describe("cancelledBeforeCharge", () => {
  it("holds for a sale that had no payment", () => {
    expect(cancelledBeforeCharge([])).toBe(true);
  });

  it.each(["PENDING", "DECLINED", "EXPIRED", "CANCELLED"])(
    "holds for a sale whose only payment is %s",
    (state) => {
      expect(cancelledBeforeCharge([{ state }])).toBe(true);
    },
  );

  it("does not hold once a payment was approved, even beside payments that never were", () => {
    expect(cancelledBeforeCharge([{ state: "DECLINED" }, { state: "APPROVED" }])).toBe(false);
  });
});
