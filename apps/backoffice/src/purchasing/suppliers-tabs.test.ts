import { expect, test } from "vitest";
import { accessWith } from "../shell/test-support/backoffice-access";
import { SUPPLIERS_TAB_TARGETS, SUPPLIERS_TABS } from "./suppliers-tabs";

function visibleTabs(...capabilities: Parameters<typeof accessWith>) {
  const access = accessWith(...capabilities);
  return SUPPLIERS_TABS.filter((tab) => tab.isVisibleTo(access)).map((tab) => tab.key);
}

test("shows both tabs to a person with the suppliers and the price lists capabilities", () => {
  expect(visibleTabs("suppliers", "supplier_price_lists")).toEqual(["suppliers", "price-lists"]);
});

test.each([
  ["suppliers", "suppliers"],
  ["supplier_price_lists", "price-lists"],
] as const)("shows only its own tab with only %s", (capability, tab) => {
  expect(visibleTabs(capability)).toEqual([tab]);
});

test("shows no tab without either capability", () => {
  expect(visibleTabs("purchases", "freights")).toEqual([]);
});

test("gives each tab its own address", () => {
  expect(SUPPLIERS_TAB_TARGETS).toEqual({
    suppliers: "/suppliers",
    "price-lists": "/suppliers/price-lists",
  });
});
