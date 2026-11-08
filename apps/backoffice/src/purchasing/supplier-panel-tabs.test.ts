import { expect, test } from "vitest";
import { accessWith } from "../shell/test-support/backoffice-access";
import { SUPPLIER_PANEL_TABS } from "./supplier-panel-tabs";

function visibleTabs(...capabilities: Parameters<typeof accessWith>) {
  const access = accessWith(...capabilities);
  return SUPPLIER_PANEL_TABS.filter((tab) => tab.isVisibleTo(access)).map((tab) => tab.key);
}

test("shows the five tabs in order to a person with every capability they need", () => {
  expect(
    visibleTabs(
      "suppliers",
      "supplier_price_lists",
      "purchase_order_reads",
      "purchases",
      "freights",
    ),
  ).toEqual(["data", "lists", "orders", "purchases", "freights"]);
});

test.each([
  ["suppliers", "data"],
  ["supplier_price_lists", "lists"],
  ["purchase_order_reads", "orders"],
  ["purchases", "purchases"],
  ["freights", "freights"],
] as const)("shows only its own tab with only %s", (capability, tab) => {
  expect(visibleTabs(capability)).toEqual([tab]);
});
