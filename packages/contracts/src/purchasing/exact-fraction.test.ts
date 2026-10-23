import { describe, expect, it } from "vitest";
import { exactFractionSchema } from "./exact-fraction.js";

describe("exactFractionSchema", () => {
  it.each([
    ["0", "1"],
    ["1105", "10"],
    ["123456789012345678901234567890", "7"],
  ])("accepts %s over %s as decimal integer strings", (numerator, denominator) => {
    expect(exactFractionSchema.safeParse({ numerator, denominator }).data).toEqual({
      numerator,
      denominator,
    });
  });

  it.each(["", "-1", "1.5", "1e3", "abc", " 1", "+1", 1])(
    "refuses the numerator %j",
    (numerator) => {
      expect(exactFractionSchema.safeParse({ numerator, denominator: "1" }).success).toBe(false);
    },
  );

  it.each(["", "0", "00", "-2", "1.5", "x", 1])("refuses the denominator %j", (denominator) => {
    expect(exactFractionSchema.safeParse({ numerator: "1", denominator }).success).toBe(false);
  });

  it("accepts a denominator with a leading digit other than zero", () => {
    expect(exactFractionSchema.safeParse({ numerator: "1", denominator: "10" }).success).toBe(true);
  });

  it("requires both parts", () => {
    expect(exactFractionSchema.safeParse({ numerator: "1" }).success).toBe(false);
    expect(exactFractionSchema.safeParse({ denominator: "1" }).success).toBe(false);
  });
});
