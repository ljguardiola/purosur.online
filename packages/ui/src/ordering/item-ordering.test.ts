import { describe, expect, it } from "vitest";
import { sortedItems, textOrder } from "./item-ordering";

type Node = { id: string; name: string; parentId: string | null };

const node = (id: string, name: string, parentId: string | null = null): Node => ({
  id,
  name,
  parentId,
});

const byId = (item: { id: string }) => item.id;
const nameOrder = textOrder((item: Node) => item.name);
const names = (items: readonly Node[]) => items.map((item) => item.name);

describe("textOrder", () => {
  it("orders texts the way they sort in Argentine Spanish", () => {
    const order = textOrder((text: string) => text);

    expect(["ñandú", "nuez", "Oliva", "árbol", "banana"].sort(order)).toEqual([
      "árbol",
      "banana",
      "nuez",
      "ñandú",
      "Oliva",
    ]);
  });
});

describe("sortedItems", () => {
  it("orders flat items ascending or descending, leaving the given list untouched", () => {
    const items = [node("1", "Pera"), node("2", "Banana"), node("3", "Manzana")];

    expect(names(sortedItems(items, { order: nameOrder, direction: "ascending" }))).toEqual([
      "Banana",
      "Manzana",
      "Pera",
    ]);
    expect(names(sortedItems(items, { order: nameOrder, direction: "descending" }))).toEqual([
      "Pera",
      "Manzana",
      "Banana",
    ]);
    expect(names(items)).toEqual(["Pera", "Banana", "Manzana"]);
  });

  describe("a tree of items", () => {
    const parentId = (item: Node) => item.parentId;
    const treeSort = (direction: "ascending" | "descending") => ({
      order: nameOrder,
      direction,
      id: byId,
      parentId,
    });

    const tree = [
      node("drinks", "Bebidas"),
      node("wine", "Vinos", "drinks"),
      node("water", "Aguas", "drinks"),
      node("red", "Tintos", "wine"),
      node("white", "Blancos", "wine"),
      node("dairy", "Lácteos"),
      node("milk", "Leches", "dairy"),
    ];

    it("places each parent right before its descendants, with siblings in ascending order", () => {
      expect(names(sortedItems(tree, treeSort("ascending")))).toEqual([
        "Bebidas",
        "Aguas",
        "Vinos",
        "Blancos",
        "Tintos",
        "Lácteos",
        "Leches",
      ]);
    });

    it("reverses the siblings at every level when descending, still placing each parent first", () => {
      expect(names(sortedItems(tree, treeSort("descending")))).toEqual([
        "Lácteos",
        "Leches",
        "Bebidas",
        "Vinos",
        "Tintos",
        "Blancos",
        "Aguas",
      ]);
    });

    it("keeps each parent's children under it when two parents share a name", () => {
      const sorted = sortedItems(
        [
          node("a", "Varios"),
          node("b", "Varios"),
          node("a1", "Zeta", "a"),
          node("b1", "Alfa", "b"),
        ],
        treeSort("ascending"),
      );

      expect(sorted.map((item) => item.id)).toEqual(["a", "a1", "b", "b1"]);
    });

    it("keeps every item, even one whose parent is missing or that sits in a cycle", () => {
      const sorted = sortedItems(
        [
          node("root", "Raíz"),
          node("orphan", "Huérfana", "gone"),
          node("loop-a", "Bucle A", "loop-b"),
          node("loop-b", "Bucle B", "loop-a"),
        ],
        treeSort("ascending"),
      );

      expect(names(sorted)).toEqual(["Bucle A", "Bucle B", "Huérfana", "Raíz"]);
    });
  });
});
