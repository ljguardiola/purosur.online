import { describe, expect, it } from "vitest";
import { stockCountResultSchema, stockMovementResultSchema } from "./stock-results.js";

describe("stockMovementResultSchema", () => {
  it("accepts the balance a movement left and whether a count superseded it", () => {
    const result = { balance: -4000, superseded: false };

    expect(stockMovementResultSchema.safeParse(result).data).toEqual(result);
  });

  it.each([
    ["balance", 0.5],
    ["superseded", "no"],
  ])("refuses %s as %j", (field, value) => {
    expect(
      stockMovementResultSchema.safeParse({ balance: 0, superseded: true, [field]: value }).success,
    ).toBe(false);
  });
});

describe("stockCountResultSchema", () => {
  it("accepts what the count expected, its difference and the balance it left", () => {
    const result = { expected: 12_400, delta: -250, balance: 12_150, superseded: false };

    expect(stockCountResultSchema.safeParse(result).data).toEqual(result);
  });

  it.each([
    ["expected", "1"],
    ["delta", 0.1],
  ])("refuses %s as %j", (field, value) => {
    expect(
      stockCountResultSchema.safeParse({
        expected: 0,
        delta: 0,
        balance: 0,
        superseded: false,
        [field]: value,
      }).success,
    ).toBe(false);
  });
});
