import { expect, test } from "vitest";
import {
  type CategoryNode,
  categoryPathLabels,
  leafCategories,
  selfAndDescendantIds,
  sortedByPathLabel,
} from "./categoryPath";

const almacen: CategoryNode = { id: "almacen", name: "Almacén", parentId: null };
const untables: CategoryNode = { id: "untables", name: "Untables", parentId: "almacen" };
const mermeladas: CategoryNode = { id: "mermeladas", name: "Mermeladas", parentId: "untables" };
const bebidas: CategoryNode = { id: "bebidas", name: "Bebidas", parentId: null };

test("categoryPathLabels joins a top-level category's own name with no separator", () => {
  const labels = categoryPathLabels([almacen, bebidas]);

  expect(labels.get("almacen")).toBe("Almacén");
  expect(labels.get("bebidas")).toBe("Bebidas");
});

test("categoryPathLabels joins a subcategory's ancestors down to itself with the design separator", () => {
  const labels = categoryPathLabels([almacen, untables, mermeladas, bebidas]);

  expect(labels.get("untables")).toBe("Almacén › Untables");
  expect(labels.get("mermeladas")).toBe("Almacén › Untables › Mermeladas");
});

test("categoryPathLabels tolerates a cycle instead of recursing forever", () => {
  const cycleA: CategoryNode = { id: "a", name: "A", parentId: "b" };
  const cycleB: CategoryNode = { id: "b", name: "B", parentId: "a" };

  const labels = categoryPathLabels([cycleA, cycleB]);

  // "a" is walked first (array order) and reaches "b" as its parent; "b" then finds "a" already
  // among its own ancestors and stops there instead of looping back into it forever.
  expect(labels.get("a")).toBe("B › A");
  expect(labels.get("b")).toBe("B");
});

test("sortedByPathLabel groups a parent immediately before its own descendants, ascending", () => {
  const categories = [bebidas, mermeladas, almacen, untables];
  const labels = categoryPathLabels(categories);

  const sorted = sortedByPathLabel(categories, labels, "ascending");

  expect(sorted.map((category) => category.id)).toEqual([
    "almacen",
    "untables",
    "mermeladas",
    "bebidas",
  ]);
});

test("sortedByPathLabel reverses the same order when sorting descending", () => {
  const categories = [bebidas, mermeladas, almacen, untables];
  const labels = categoryPathLabels(categories);

  const sorted = sortedByPathLabel(categories, labels, "descending");

  expect(sorted.map((category) => category.id)).toEqual([
    "bebidas",
    "mermeladas",
    "untables",
    "almacen",
  ]);
});

test("leafCategories keeps only categories nothing else names as its parent", () => {
  const categories = [almacen, untables, mermeladas, bebidas];

  expect(
    leafCategories(categories)
      .map((category) => category.id)
      .sort(),
  ).toEqual(["bebidas", "mermeladas"]);
});

test("selfAndDescendantIds returns a category together with every one of its descendants", () => {
  const categories = [almacen, untables, mermeladas, bebidas];

  const ids = selfAndDescendantIds(categories, "almacen");

  expect([...ids].sort()).toEqual(["almacen", "mermeladas", "untables"]);
});

test("selfAndDescendantIds returns only the category itself when it has no children", () => {
  const categories = [almacen, untables, mermeladas, bebidas];

  expect([...selfAndDescendantIds(categories, "bebidas")]).toEqual(["bebidas"]);
});
