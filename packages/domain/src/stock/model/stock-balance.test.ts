import { describe, expect, it } from "vitest";
import { isListedInStockBalances } from "./stock-balance.js";

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
