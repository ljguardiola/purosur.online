import { expect, test } from "vitest";
import { accessWith } from "../shell/test-support/backoffice-access";
import { PURCHASES_TAB_TARGETS, PURCHASES_TABS } from "./purchases-tabs";

function visibleTabs(...capabilities: Parameters<typeof accessWith>) {
  const access = accessWith(...capabilities);
  return PURCHASES_TABS.filter((tab) => tab.isVisibleTo(access)).map((tab) => tab.key);
}

test("shows both tabs, in order, to a person who records purchases and manages freights", () => {
  expect(visibleTabs("purchases", "freights")).toEqual(["purchases", "freights"]);
});

test("shows only the purchases tab with only purchases", () => {
  expect(visibleTabs("purchases")).toEqual(["purchases"]);
});

test("shows only the freights tab with only freights", () => {
  expect(visibleTabs("freights")).toEqual(["freights"]);
});

test("shows no tab without either capability", () => {
  expect(visibleTabs("purchase_orders", "suppliers")).toEqual([]);
});

test("gives each tab its own address", () => {
  expect(PURCHASES_TAB_TARGETS).toEqual({
    purchases: "/purchases",
    freights: "/purchases/freights",
  });
});
