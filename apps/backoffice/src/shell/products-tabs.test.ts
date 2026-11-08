import { expect, test } from "vitest";
import { PRODUCTS_TAB_TARGETS, PRODUCTS_TABS } from "./products-tabs";
import { accessWith } from "./test-support/backoffice-access";

function visibleTabs(...capabilities: Parameters<typeof accessWith>) {
  const access = accessWith(...capabilities);
  return PRODUCTS_TABS.filter((tab) => tab.isVisibleTo(access)).map((tab) => tab.key);
}

test("shows every tab to a person with every catalog capability", () => {
  expect(
    visibleTabs("products_and_categories", "prices_area", "promotions", "recipes", "batches"),
  ).toEqual(["products", "prices", "promotions", "assemblies", "classification"]);
});

test("shows Productos and Clasificación with products and categories", () => {
  expect(visibleTabs("products_and_categories")).toEqual(["products", "classification"]);
});

test.each([
  ["prices_area", "prices"],
  ["promotions", "promotions"],
  ["recipes", "assemblies"],
] as const)("shows only its own tab with only %s", (capability, tab) => {
  expect(visibleTabs(capability)).toEqual([tab]);
});

test("shows Armados with only the batches capability", () => {
  expect(visibleTabs("batches")).toEqual(["assemblies"]);
});

test("gives each tab its own address", () => {
  expect(PRODUCTS_TAB_TARGETS).toEqual({
    products: "/products",
    prices: "/products/prices",
    promotions: "/products/promotions",
    assemblies: "/products/assemblies",
    classification: "/products/classification",
  });
});
