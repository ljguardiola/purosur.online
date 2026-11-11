import { expect, test } from "vitest";
import { accessWith } from "../shell/test-support/backoffice-access";
import { ASSEMBLIES_SECTION_TARGETS, ASSEMBLIES_SECTIONS } from "./assemblies-sections";

function visibleSections(...capabilities: Parameters<typeof accessWith>) {
  const access = accessWith(...capabilities);
  return ASSEMBLIES_SECTIONS.filter((section) => section.isVisibleTo(access)).map(
    (section) => section.key,
  );
}

test("shows Recetas and Producciones to a person with recipes and batches", () => {
  expect(visibleSections("recipes", "batches")).toEqual(["recipes", "batches"]);
});

test("shows only Recetas with only the recipes capability", () => {
  expect(visibleSections("recipes")).toEqual(["recipes"]);
});

test("shows only Producciones with only the batches capability", () => {
  expect(visibleSections("batches")).toEqual(["batches"]);
});

test("shows no section without recipes or batches", () => {
  expect(visibleSections("promotions")).toEqual([]);
});

test("gives each section its own address", () => {
  expect(ASSEMBLIES_SECTION_TARGETS).toEqual({
    recipes: "/products/assemblies",
    batches: "/products/assemblies/batches",
  });
});
