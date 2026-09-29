import { expect, test } from "vitest";
import {
  type CategoryNode,
  categoriesInTreeOrder,
  categoryPathLabels,
  leafCategories,
  selfAndDescendantIds,
} from "./category-path";

const groceries: CategoryNode = { id: "almacen", name: "Almacén", parentId: null };
const spreads: CategoryNode = { id: "untables", name: "Untables", parentId: "almacen" };
const jams: CategoryNode = { id: "mermeladas", name: "Mermeladas", parentId: "untables" };
const drinks: CategoryNode = { id: "bebidas", name: "Bebidas", parentId: null };

test("categoryPathLabels joins a top-level category's own name with no separator", () => {
  const labels = categoryPathLabels([groceries, drinks]);

  expect(labels.get("almacen")).toBe("Almacén");
  expect(labels.get("bebidas")).toBe("Bebidas");
});

test("categoryPathLabels joins a subcategory's ancestors down to itself with the design separator", () => {
  const labels = categoryPathLabels([groceries, spreads, jams, drinks]);

  expect(labels.get("untables")).toBe("Almacén › Untables");
  expect(labels.get("mermeladas")).toBe("Almacén › Untables › Mermeladas");
});

test("categoryPathLabels breaks a cycle at the first ancestor it has already visited", () => {
  const cycleA: CategoryNode = { id: "a", name: "A", parentId: "b" };
  const cycleB: CategoryNode = { id: "b", name: "B", parentId: "a" };

  const labels = categoryPathLabels([cycleA, cycleB]);

  expect(labels.get("a")).toBe("B › A");
  expect(labels.get("b")).toBe("B");
});

test("leafCategories keeps only categories nothing else names as its parent", () => {
  const categories = [groceries, spreads, jams, drinks];

  expect(
    leafCategories(categories)
      .map((category) => category.id)
      .sort(),
  ).toEqual(["bebidas", "mermeladas"]);
});

test("selfAndDescendantIds returns a category together with every one of its descendants", () => {
  const categories = [groceries, spreads, jams, drinks];

  const ids = selfAndDescendantIds(categories, "almacen");

  expect([...ids].sort()).toEqual(["almacen", "mermeladas", "untables"]);
});

test("selfAndDescendantIds returns only the category itself when it has no children", () => {
  const categories = [groceries, spreads, jams, drinks];

  expect([...selfAndDescendantIds(categories, "bebidas")]).toEqual(["bebidas"]);
});

test("categoriesInTreeOrder lists each category right before its subcategories, by name", () => {
  const ordered = categoriesInTreeOrder([jams, drinks, spreads, groceries]);

  expect(ordered.map((category) => category.id)).toEqual([
    "almacen",
    "untables",
    "mermeladas",
    "bebidas",
  ]);
});
