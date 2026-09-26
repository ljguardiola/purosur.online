import { expect, test } from "vitest";
import {
  type CategoryNode,
  categoriesInTreeOrder,
  categoryPathLabels,
  leafCategories,
  selfAndDescendantIds,
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

test("categoriesInTreeOrder places each parent immediately before its own descendants, ascending", () => {
  const categories = [bebidas, mermeladas, almacen, untables];

  const sorted = categoriesInTreeOrder(categories, "ascending");

  expect(sorted.map((category) => category.id)).toEqual([
    "almacen",
    "untables",
    "mermeladas",
    "bebidas",
  ]);
});

test("categoriesInTreeOrder keeps a parent's children together even when a sibling's name extends the parent's", () => {
  const almacenNorte: CategoryNode = {
    id: "almacen-norte",
    name: "Almacén - Norte",
    parentId: null,
  };

  const sorted = categoriesInTreeOrder([almacenNorte, untables, almacen], "ascending");

  expect(sorted.map((category) => category.id)).toEqual(["almacen", "untables", "almacen-norte"]);
});

test("categoriesInTreeOrder keeps each parent's children under it when two parents' names differ only by an accent", () => {
  const unaccented: CategoryNode = { id: "unaccented", name: "Almacen", parentId: null };
  const accented: CategoryNode = { id: "accented", name: "Almacén", parentId: null };
  const underAccented: CategoryNode = { id: "under-accented", name: "A", parentId: "accented" };
  const underUnaccented: CategoryNode = {
    id: "under-unaccented",
    name: "Z",
    parentId: "unaccented",
  };

  const sorted = categoriesInTreeOrder(
    [underAccented, accented, underUnaccented, unaccented],
    "ascending",
  );

  expect(sorted.map((category) => category.id)).toEqual([
    "unaccented",
    "under-unaccented",
    "accented",
    "under-accented",
  ]);
});

test("categoriesInTreeOrder reverses siblings at every level when descending, still placing each parent before its descendants", () => {
  const aceites: CategoryNode = { id: "aceites", name: "Aceites", parentId: "almacen" };
  const categories = [bebidas, mermeladas, almacen, untables, aceites];

  const sorted = categoriesInTreeOrder(categories, "descending");

  expect(sorted.map((category) => category.id)).toEqual([
    "bebidas",
    "almacen",
    "untables",
    "mermeladas",
    "aceites",
  ]);
});

test("categoriesInTreeOrder keeps every category, even one whose parent is missing or that sits in a cycle", () => {
  const orphan: CategoryNode = { id: "orphan", name: "Huérfana", parentId: "missing" };
  const cycleA: CategoryNode = { id: "a", name: "A", parentId: "b" };
  const cycleB: CategoryNode = { id: "b", name: "B", parentId: "a" };

  const sorted = categoriesInTreeOrder([cycleA, orphan, cycleB, bebidas], "ascending");

  expect(sorted.map((category) => category.id).sort()).toEqual(["a", "b", "bebidas", "orphan"]);
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
