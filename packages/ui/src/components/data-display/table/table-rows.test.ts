import { describe, expect, it } from "vitest";
import { textOrder } from "../../../ordering/item-ordering";
import { tableRows } from "./table-rows";

type Fruit = { id: string; name: string; codes: string[] };

const fruit = (id: string, name: string, codes: string[] = []): Fruit => ({ id, name, codes });

const byId = (item: { id: string }) => item.id;

const names = (rows: readonly { item: { name: string } }[]) => rows.map((row) => row.item.name);

describe("tableRows", () => {
  it("makes one row per item, keyed by its id, in the order it is given", () => {
    const pear = fruit("2", "Pera");
    const apple = fruit("1", "Manzana");

    expect(tableRows({ items: [pear, apple], id: byId }).rows).toEqual([
      { id: "2", item: pear },
      { id: "1", item: apple },
    ]);
  });

  it("keeps the items whose texts contain the search, ignoring case and surrounding spaces", () => {
    const items = [fruit("1", "MANZANA", ["779"]), fruit("2", "Pera"), fruit("3", "Banana")];

    const { rows } = tableRows({
      items,
      id: byId,
      search: { text: "  aNa ", in: (item) => [item.name, ...item.codes] },
    });

    expect(names(rows)).toEqual(["MANZANA", "Banana"]);
  });

  it("matches the search against any of an item's texts", () => {
    const items = [fruit("1", "Manzana", ["779", "123"]), fruit("2", "Pera", ["456"])];

    const { rows } = tableRows({
      items,
      id: byId,
      search: { text: "12", in: (item) => [item.name, ...item.codes] },
    });

    expect(names(rows)).toEqual(["Manzana"]);
  });

  it("keeps every item when the search is blank", () => {
    const items = [fruit("1", "Manzana"), fruit("2", "Pera")];

    const { rows } = tableRows({
      items,
      id: byId,
      search: { text: "   ", in: (item) => [item.name] },
    });

    expect(names(rows)).toEqual(["Manzana", "Pera"]);
  });

  it("keeps only the items the filter accepts, together with the search", () => {
    const items = [
      fruit("1", "Manzana", ["a"]),
      fruit("2", "Mandarina"),
      fruit("3", "Pera", ["a"]),
    ];

    const { rows } = tableRows({
      items,
      id: byId,
      search: { text: "man", in: (item) => [item.name] },
      filter: (item) => item.codes.length > 0,
    });

    expect(names(rows)).toEqual(["Manzana"]);
  });

  it("orders the items by the sorted column, ascending or descending", () => {
    const items = [fruit("1", "Pera"), fruit("2", "Banana"), fruit("3", "Manzana")];
    const orders = { fruit: textOrder((item: Fruit) => item.name) };

    const ascending = tableRows({
      items,
      id: byId,
      sort: { by: { column: "fruit", direction: "ascending" }, orders },
    });
    const descending = tableRows({
      items,
      id: byId,
      sort: { by: { column: "fruit", direction: "descending" }, orders },
    });

    expect(names(ascending.rows)).toEqual(["Banana", "Manzana", "Pera"]);
    expect(names(descending.rows)).toEqual(["Pera", "Manzana", "Banana"]);
  });

  it("orders by the order of the column the sort names", () => {
    const items = [fruit("b", "Banana"), fruit("a", "Pera")];
    const orders = {
      fruit: textOrder((item: Fruit) => item.name),
      code: textOrder((item: Fruit) => item.id),
    };

    const { rows } = tableRows({
      items,
      id: byId,
      sort: { by: { column: "code", direction: "ascending" }, orders },
    });

    expect(names(rows)).toEqual(["Pera", "Banana"]);
  });

  it("keeps items that tie in the order they are given, in either direction", () => {
    const items = [fruit("1", "Pera"), fruit("2", "Banana"), fruit("3", "Pera")];
    const orders = { fruit: textOrder((item: Fruit) => item.name) };

    const ascending = tableRows({
      items,
      id: byId,
      sort: { by: { column: "fruit", direction: "ascending" }, orders },
    });
    const descending = tableRows({
      items,
      id: byId,
      sort: { by: { column: "fruit", direction: "descending" }, orders },
    });

    expect(ascending.rows.map((row) => row.id)).toEqual(["2", "1", "3"]);
    expect(descending.rows.map((row) => row.id)).toEqual(["1", "3", "2"]);
  });

  it("counts every item the search leaves, not only the page shown", () => {
    const items = [fruit("1", "Manzana"), fruit("2", "Banana"), fruit("3", "Pera")];

    const { matchCount } = tableRows({
      items,
      id: byId,
      search: { text: "an", in: (item) => [item.name] },
      page: { number: 1, size: 1 },
    });

    expect(matchCount).toBe(2);
  });

  describe("paging", () => {
    const items = ["A", "B", "C", "D", "E"].map((name) => fruit(name, name));

    it("shows the rows of the page it is given", () => {
      const result = tableRows({ items, id: byId, page: { number: 2, size: 2 } });

      expect(names(result.rows)).toEqual(["C", "D"]);
      expect(result.page).toBe(2);
      expect(result.pageCount).toBe(3);
    });

    it("pages the rows the filter leaves, after ordering them", () => {
      const result = tableRows({
        items: [...items].reverse(),
        id: byId,
        filter: (item) => item.name !== "B",
        sort: {
          by: { column: "fruit", direction: "ascending" },
          orders: { fruit: textOrder((item: Fruit) => item.name) },
        },
        page: { number: 2, size: 2 },
      });

      expect(names(result.rows)).toEqual(["D", "E"]);
      expect(result.pageCount).toBe(2);
    });

    it("shows the last page for a page past the end", () => {
      const result = tableRows({ items, id: byId, page: { number: 9, size: 2 } });

      expect(names(result.rows)).toEqual(["E"]);
      expect(result.page).toBe(3);
    });

    it("shows the first page for a page before the start", () => {
      const result = tableRows({ items, id: byId, page: { number: 0, size: 2 } });

      expect(names(result.rows)).toEqual(["A", "B"]);
      expect(result.page).toBe(1);
    });

    it("shows one row per page for a page size below one", () => {
      const result = tableRows({ items, id: byId, page: { number: 2, size: 0 } });

      expect(names(result.rows)).toEqual(["B"]);
      expect(result.pageCount).toBe(5);
    });

    it("shows the first page for a page number that is not a number", () => {
      const result = tableRows({ items, id: byId, page: { number: Number.NaN, size: 2 } });

      expect(names(result.rows)).toEqual(["A", "B"]);
      expect(result.page).toBe(1);
    });

    it("rounds a fractional page number and page size down", () => {
      const result = tableRows({ items, id: byId, page: { number: 2.7, size: 2.5 } });

      expect(names(result.rows)).toEqual(["C", "D"]);
      expect(result.page).toBe(2);
    });

    it("has one empty page when nothing matches", () => {
      const result = tableRows({
        items,
        id: byId,
        filter: () => false,
        page: { number: 3, size: 2 },
      });

      expect(result.rows).toEqual([]);
      expect(result.page).toBe(1);
      expect(result.pageCount).toBe(1);
    });

    it("has a single page holding every row when it is not paged", () => {
      const result = tableRows({ items, id: byId });

      expect(result.rows).toHaveLength(5);
      expect(result.page).toBe(1);
      expect(result.pageCount).toBe(1);
    });
  });

  describe("a tree of items", () => {
    type Node = { id: string; name: string; parentId: string | null };
    const node = (id: string, name: string, parentId: string | null = null): Node => ({
      id,
      name,
      parentId,
    });
    const orders = { node: textOrder((item: Node) => item.name) };
    const parentId = (item: Node) => item.parentId;

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
      const { rows } = tableRows({
        items: tree,
        id: byId,
        sort: { by: { column: "node", direction: "ascending" }, orders, parentId },
      });

      expect(names(rows)).toEqual([
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
      const { rows } = tableRows({
        items: tree,
        id: byId,
        sort: { by: { column: "node", direction: "descending" }, orders, parentId },
      });

      expect(names(rows)).toEqual([
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
      const { rows } = tableRows({
        items: [
          node("a", "Varios"),
          node("b", "Varios"),
          node("a1", "Zeta", "a"),
          node("b1", "Alfa", "b"),
        ],
        id: byId,
        sort: { by: { column: "node", direction: "ascending" }, orders, parentId },
      });

      expect(rows.map((row) => row.id)).toEqual(["a", "a1", "b", "b1"]);
    });

    it("keeps every item, even one whose parent is missing or that sits in a cycle", () => {
      const { rows } = tableRows({
        items: [
          node("root", "Raíz"),
          node("orphan", "Huérfana", "gone"),
          node("loop-a", "Bucle A", "loop-b"),
          node("loop-b", "Bucle B", "loop-a"),
        ],
        id: byId,
        sort: { by: { column: "node", direction: "ascending" }, orders, parentId },
      });

      expect(names(rows)).toEqual(["Huérfana", "Raíz", "Bucle A", "Bucle B"]);
    });

    it("keeps a matching child in its place in the tree when the search hides its parent", () => {
      const { rows } = tableRows({
        items: tree,
        id: byId,
        search: { text: "o", in: (item) => [item.name] },
        sort: { by: { column: "node", direction: "ascending" }, orders, parentId },
      });

      expect(names(rows)).toEqual(["Vinos", "Blancos", "Tintos", "Lácteos"]);
    });
  });
});
