import { describe, expect, it } from "vitest";
import { currentStockSummary, holdsCurrentStock } from "./current-stock-summary.js";

describe("holdsCurrentStock", () => {
  it("holds stock with a positive balance", () => {
    expect(holdsCurrentStock({ balance: 1_000, lotCount: 0 })).toBe(true);
  });

  it("holds stock with a negative balance", () => {
    expect(holdsCurrentStock({ balance: -1_000, lotCount: 0 })).toBe(true);
  });

  it("holds stock with a zero balance when a lot is still in stock", () => {
    expect(holdsCurrentStock({ balance: 0, lotCount: 2 })).toBe(true);
  });

  it("holds no stock with a zero balance and no lot in stock", () => {
    expect(holdsCurrentStock({ balance: 0, lotCount: 0 })).toBe(false);
  });
});

describe("currentStockSummary", () => {
  it("is empty for no products", () => {
    expect(currentStockSummary([])).toEqual({
      valueCents: 0,
      productCount: 0,
      negativeBalanceCount: 0,
      withoutCostCount: 0,
    });
  });

  it("counts the products and adds up the values there are", () => {
    expect(
      currentStockSummary([
        { balance: 1_000, valueCents: 20_000 },
        { balance: 2_000, valueCents: 5_000 },
      ]),
    ).toEqual({
      valueCents: 25_000,
      productCount: 2,
      negativeBalanceCount: 0,
      withoutCostCount: 0,
    });
  });

  it("counts a product without a value apart and leaves it out of the total", () => {
    expect(
      currentStockSummary([
        { balance: 1_000, valueCents: 20_000 },
        { balance: 3_000, valueCents: null },
      ]),
    ).toEqual({
      valueCents: 20_000,
      productCount: 2,
      negativeBalanceCount: 0,
      withoutCostCount: 1,
    });
  });

  it("counts the products with a negative balance and subtracts their value", () => {
    expect(
      currentStockSummary([
        { balance: 1_000, valueCents: 20_000 },
        { balance: -1_000, valueCents: -3_000 },
        { balance: -500, valueCents: null },
      ]),
    ).toEqual({
      valueCents: 17_000,
      productCount: 3,
      negativeBalanceCount: 2,
      withoutCostCount: 1,
    });
  });

  it("does not count a zero balance as negative", () => {
    expect(currentStockSummary([{ balance: 0, valueCents: 0 }]).negativeBalanceCount).toBe(0);
  });
});
