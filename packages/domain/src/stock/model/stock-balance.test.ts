import { describe, expect, it } from "vitest";
import { isListedInStockBalances, stockBalancesSummary } from "./stock-balance.js";

describe("isListedInStockBalances", () => {
  it("lists an active product with no stock", () => {
    expect(isListedInStockBalances({ active: true, balance: 0 })).toBe(true);
  });

  it("lists an active product whatever its balance", () => {
    expect(isListedInStockBalances({ active: true, balance: 2500 })).toBe(true);
    expect(isListedInStockBalances({ active: true, balance: -1000 })).toBe(true);
  });

  it("lists a deactivated product that still has stock", () => {
    expect(isListedInStockBalances({ active: false, balance: 3000 })).toBe(true);
  });

  it("lists a deactivated product whose balance is negative", () => {
    expect(isListedInStockBalances({ active: false, balance: -1000 })).toBe(true);
  });

  it("leaves out a deactivated product with no stock", () => {
    expect(isListedInStockBalances({ active: false, balance: 0 })).toBe(false);
  });
});

describe("stockBalancesSummary", () => {
  it("counts the products, adds up the values there are and counts those without one", () => {
    expect(
      stockBalancesSummary([{ valueCents: 20_000 }, { valueCents: null }, { valueCents: -500 }]),
    ).toEqual({ productCount: 3, valueCents: 19_500, withoutCostCount: 1 });
  });

  it("is empty for no products", () => {
    expect(stockBalancesSummary([])).toEqual({
      productCount: 0,
      valueCents: 0,
      withoutCostCount: 0,
    });
  });
});
