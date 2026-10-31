import { describe, expect, it } from "vitest";
import { thousandthsOf } from "./supplier-item-quantity-prompt.js";

describe("thousandthsOf", () => {
  it.each([
    [36, 36_000],
    [12.5, 12_500],
    [5, 5_000],
    [0.25, 250],
    [0.001, 1],
    [1.0005, 1_001],
  ])("turns %j of the sale unit into %j thousandths", (quantity, thousandths) => {
    expect(thousandthsOf(quantity)).toBe(thousandths);
  });

  it("keeps an unanswered quantity unanswered", () => {
    expect(thousandthsOf(null)).toBeNull();
  });
});
