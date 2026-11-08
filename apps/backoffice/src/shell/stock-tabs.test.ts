import { expect, test } from "vitest";
import { STOCK_TAB_TARGETS, STOCK_TABS } from "./stock-tabs";
import { accessWith } from "./test-support/backoffice-access";

function visibleTabs(...capabilities: Parameters<typeof accessWith>) {
  const access = accessWith(...capabilities);
  return STOCK_TABS.filter((tab) => tab.isVisibleTo(access)).map((tab) => tab.key);
}

test("shows every tab to a person with every stock capability", () => {
  expect(visibleTabs("stock_balances", "stock_expiries", "stock_movements")).toEqual([
    "balances",
    "expiries",
    "movements",
  ]);
});

test.each([
  ["stock_balances", "balances"],
  ["stock_expiries", "expiries"],
  ["stock_counts", "movements"],
  ["stock_movements", "movements"],
] as const)("shows only its own tab with only %s", (capability, tab) => {
  expect(visibleTabs(capability)).toEqual([tab]);
});

test("shows no tab with only the initial inventory capability", () => {
  expect(visibleTabs("initial_inventory")).toEqual([]);
});

test("gives each tab its own address", () => {
  expect(STOCK_TAB_TARGETS).toEqual({
    balances: "/stock",
    expiries: "/stock/expiries",
    movements: "/stock/movements",
  });
});
