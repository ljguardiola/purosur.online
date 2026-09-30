import { describe, expect, it } from "vitest";
import { linePromotionText } from "./line-promotion-text";

describe("linePromotionText", () => {
  it("writes the percentage off with a spaced percent sign", () => {
    expect(linePromotionText({ kind: "PERCENT_OFF", percent: 15 })).toBe("15 % de descuento");
  });

  it("writes how many units are bought and how many are paid", () => {
    expect(linePromotionText({ kind: "BUY_N_PAY_M", buy_qty: 3, pay_qty: 2 })).toBe(
      "Lleve 3, pague 2",
    );
  });

  it("writes large quantities with the Argentine thousands separator", () => {
    expect(linePromotionText({ kind: "BUY_N_PAY_M", buy_qty: 1200, pay_qty: 1000 })).toBe(
      "Lleve 1.200, pague 1.000",
    );
  });
});
