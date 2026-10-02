import { describe, expect, it } from "vitest";
import { DEFAULT_STOCK_PERIOD_DAYS, STOCK_PERIOD_DAYS } from "./stock-period.js";

describe("STOCK_PERIOD_DAYS", () => {
  it("offers the last week, month and three months of stock history", () => {
    expect(STOCK_PERIOD_DAYS).toEqual([7, 30, 90]);
  });
});

describe("DEFAULT_STOCK_PERIOD_DAYS", () => {
  it("shows the last month when no period is chosen", () => {
    expect(DEFAULT_STOCK_PERIOD_DAYS).toBe(30);
  });
});
