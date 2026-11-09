import { expect, test } from "vitest";
import { accessWith } from "../shell/test-support/backoffice-access";
import { PURCHASE_ORDERS_TAB_TARGETS, PURCHASE_ORDERS_TABS } from "./purchase-orders-tabs";

function visibleTabs(...capabilities: Parameters<typeof accessWith>) {
  const access = accessWith(...capabilities);
  return PURCHASE_ORDERS_TABS.filter((tab) => tab.isVisibleTo(access)).map((tab) => tab.key);
}

test("shows the three tabs, in order, to a person who reads purchase orders and compares prices", () => {
  expect(visibleTabs("purchase_order_reads", "price_comparison")).toEqual([
    "orders",
    "suggestion",
    "comparison",
  ]);
});

test("shows only the orders tab with only purchase_order_reads", () => {
  expect(visibleTabs("purchase_order_reads")).toEqual(["orders"]);
});

test("shows the suggestion and comparison tabs with only price_comparison", () => {
  expect(visibleTabs("price_comparison")).toEqual(["suggestion", "comparison"]);
});

test("shows no tab without either capability", () => {
  expect(visibleTabs("purchases", "purchase_orders")).toEqual([]);
});

test("gives each tab its own address", () => {
  expect(PURCHASE_ORDERS_TAB_TARGETS).toEqual({
    orders: "/purchase-orders",
    suggestion: "/purchase-orders/suggestion",
    comparison: "/purchase-orders/comparison",
  });
});
