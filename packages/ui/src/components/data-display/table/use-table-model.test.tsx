import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { renderHook } from "vitest-browser-react";
import { sortedItems, textOrder } from "../../../ordering/item-ordering";
import { dataColumn } from "./table-columns";
import type { TableColumn, TableColumns, TableSort } from "./table-types";
import { type TableModelOptions, useTableModel } from "./use-table-model";

type Fruit = { id: string; name: string; codes: string[]; weight: number };

const fruit = (id: string, name: string, codes: string[] = [], weight = 0): Fruit => ({
  id,
  name,
  codes,
  weight,
});

const byId = (item: { id: string }) => item.id;

const nameColumn = dataColumn({
  id: "name",
  header: "Fruta",
  render: (item: Fruit) => item.name,
  sort: { order: textOrder((item: Fruit) => item.name), firstDirection: "ascending" },
});
const weightColumn = dataColumn({
  id: "weight",
  header: "Peso",
  render: (item: Fruit) => String(item.weight),
  sort: { order: (a: Fruit, b: Fruit) => a.weight - b.weight, firstDirection: "descending" },
});
const originColumn = dataColumn({
  id: "origin",
  header: "Origen",
  render: (item: Fruit) => item.codes.join(" "),
});

const sortableColumns = [nameColumn, weightColumn, originColumn] as const;
const plainColumns = [originColumn] as const;

const ascending = (column: "name" | "weight"): TableSort<"name" | "weight"> => ({
  column,
  direction: "ascending",
});
const descending = (column: "name" | "weight"): TableSort<"name" | "weight"> => ({
  column,
  direction: "descending",
});

type SortableOptions = Omit<TableModelOptions<Fruit, typeof sortableColumns>, "columns">;

async function sorted(options: Omit<SortableOptions, "id">) {
  const { result } = await renderHook(() =>
    useTableModel({ id: byId, columns: sortableColumns, ...options }),
  );
  return result.current.getRowModel().rows.map((row) => row.original.name);
}

async function shown(
  options: Omit<TableModelOptions<Fruit, typeof plainColumns>, "columns" | "id">,
) {
  const { result } = await renderHook(() =>
    useTableModel({ id: byId, columns: plainColumns, ...options }),
  );
  return result.current.getRowModel().rows.map((row) => row.original.name);
}

describe("rows", () => {
  it("makes one row per item, keyed by its id, in the order the items are given", async () => {
    const pear = fruit("2", "Pera");
    const apple = fruit("1", "Manzana");
    const { result } = await renderHook(() =>
      useTableModel({ items: [pear, apple], id: byId, columns: plainColumns }),
    );

    const rows = result.current.getRowModel().rows;

    expect(rows.map((row) => row.id)).toEqual(["2", "1"]);
    expect(rows.map((row) => row.original)).toEqual([pear, apple]);
  });

  it("keeps the items whose texts contain the search, ignoring case and surrounding spaces", async () => {
    const items = [fruit("1", "MANZANA", ["779"]), fruit("2", "Pera"), fruit("3", "Banana")];

    expect(
      await shown({
        items,
        search: { text: "  aNa ", in: (item) => [item.name, ...item.codes] },
      }),
    ).toEqual(["MANZANA", "Banana"]);
  });

  it("matches the search against any of an item's texts", async () => {
    const items = [fruit("1", "Manzana", ["779", "123"]), fruit("2", "Pera", ["456"])];

    expect(
      await shown({ items, search: { text: "12", in: (item) => [item.name, ...item.codes] } }),
    ).toEqual(["Manzana"]);
  });

  it("keeps every item when the search is blank", async () => {
    const items = [fruit("1", "Manzana"), fruit("2", "Pera")];

    expect(await shown({ items, search: { text: "   ", in: (item) => [item.name] } })).toEqual([
      "Manzana",
      "Pera",
    ]);
  });

  it("keeps only the items the filter accepts, together with the search", async () => {
    const items = [
      fruit("1", "Manzana", ["a"]),
      fruit("2", "Mandarina"),
      fruit("3", "Pera", ["a"]),
    ];

    expect(
      await shown({
        items,
        search: { text: "man", in: (item) => [item.name] },
        filter: (item) => item.codes.length > 0,
      }),
    ).toEqual(["Manzana"]);
  });

  it("keeps only the items the filter accepts when there is no search", async () => {
    const items = [fruit("1", "Manzana", ["a"]), fruit("2", "Pera")];

    expect(await shown({ items, filter: (item) => item.codes.length === 0 })).toEqual(["Pera"]);
  });

  it("shows the items again when the search is cleared", async () => {
    const items = [fruit("1", "Manzana"), fruit("2", "Pera")];
    const { result, rerender } = await renderHook(
      ({ text }: { text: string } = { text: "" }) =>
        useTableModel({
          items,
          id: byId,
          columns: plainColumns,
          search: { text, in: (item) => [item.name] },
        }),
      { initialProps: { text: "pera" } },
    );
    expect(result.current.getRowModel().rows).toHaveLength(1);

    await rerender({ text: "" });

    expect(result.current.getRowModel().rows).toHaveLength(2);
  });
});

describe("sorting", () => {
  const items = [
    fruit("1", "Pera", [], 3),
    fruit("2", "Banana", [], 9),
    fruit("3", "Manzana", [], 5),
  ];

  it("orders the items by the sorted column, ascending or descending", async () => {
    expect(await sorted({ items, sort: ascending("name"), onSortChange: () => {} })).toEqual([
      "Banana",
      "Manzana",
      "Pera",
    ]);
    expect(await sorted({ items, sort: descending("name"), onSortChange: () => {} })).toEqual([
      "Pera",
      "Manzana",
      "Banana",
    ]);
  });

  it("orders by the order of the column the sort names", async () => {
    expect(await sorted({ items, sort: ascending("weight"), onSortChange: () => {} })).toEqual([
      "Pera",
      "Manzana",
      "Banana",
    ]);
  });

  it("keeps items that tie in the order they are given, in either direction", async () => {
    const tied = [fruit("1", "Pera"), fruit("2", "Banana"), fruit("3", "Pera")];
    const idsOf = async (sort: TableSort<"name" | "weight">) => {
      const { result } = await renderHook(() =>
        useTableModel({
          items: tied,
          id: byId,
          columns: sortableColumns,
          sort,
          onSortChange: () => {},
        }),
      );
      return result.current.getRowModel().rows.map((row) => row.id);
    };

    expect(await idsOf(ascending("name"))).toEqual(["2", "1", "3"]);
    expect(await idsOf(descending("name"))).toEqual(["1", "3", "2"]);
  });

  it("sorts the rows the search and the filter leave", async () => {
    expect(
      await sorted({
        items,
        search: { text: "an", in: (item) => [item.name] },
        sort: descending("name"),
        onSortChange: () => {},
      }),
    ).toEqual(["Manzana", "Banana"]);
  });

  it("reports the column's first direction when an unsorted sortable column is toggled", async () => {
    const onSortChange = vi.fn();
    const { result } = await renderHook(() =>
      useTableModel({
        items,
        id: byId,
        columns: sortableColumns,
        sort: ascending("name"),
        onSortChange,
      }),
    );

    result.current.getColumn("weight")?.toggleSorting();

    expect(onSortChange).toHaveBeenCalledExactlyOnceWith(descending("weight"));
  });

  it("reports the opposite direction when the sorted column is toggled, never leaving it unsorted", async () => {
    const onSortChange = vi.fn();
    const { result } = await renderHook(() =>
      useTableModel({
        items,
        id: byId,
        columns: sortableColumns,
        sort: ascending("name"),
        onSortChange,
      }),
    );

    result.current.getColumn("name")?.toggleSorting();
    expect(onSortChange).toHaveBeenLastCalledWith(descending("name"));
  });

  it("reports ascending when the column sorted descending is toggled", async () => {
    const onSortChange = vi.fn();
    const { result } = await renderHook(() =>
      useTableModel({
        items,
        id: byId,
        columns: sortableColumns,
        sort: descending("name"),
        onSortChange,
      }),
    );

    result.current.getColumn("name")?.toggleSorting();

    expect(onSortChange).toHaveBeenLastCalledWith(ascending("name"));
  });

  it("only lets a column sort when the column declares an order", async () => {
    const { result } = await renderHook(() =>
      useTableModel({
        items,
        id: byId,
        columns: sortableColumns,
        sort: ascending("name"),
        onSortChange: () => {},
      }),
    );

    expect(result.current.getColumn("name")?.getCanSort()).toBe(true);
    expect(result.current.getColumn("origin")?.getCanSort()).toBe(false);
  });
});

describe("a tree of items", () => {
  type Node = { id: string; name: string; parentId: string | null };
  const node = (id: string, name: string, parentId: string | null = null): Node => ({
    id,
    name,
    parentId,
  });
  const nodeColumn = dataColumn({
    id: "node",
    header: "Nodo",
    render: (item: Node) => item.name,
    sort: { order: textOrder((item: Node) => item.name), firstDirection: "ascending" },
  });
  const nodeColumns = [nodeColumn] as const;
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

  async function nodes(
    items: Node[],
    direction: "ascending" | "descending",
    search?: { text: string; in: (item: Node) => readonly string[] },
  ) {
    const { result } = await renderHook(() =>
      useTableModel({
        items,
        id: byId,
        parentId,
        columns: nodeColumns,
        sort: { column: "node", direction },
        onSortChange: () => {},
        ...(search === undefined ? {} : { search }),
      }),
    );
    return result.current.getRowModel().rows.map((row) => row.original.name);
  }

  it("places each parent right before its descendants, with siblings in ascending order", async () => {
    expect(await nodes(tree, "ascending")).toEqual([
      "Bebidas",
      "Aguas",
      "Vinos",
      "Blancos",
      "Tintos",
      "Lácteos",
      "Leches",
    ]);
  });

  it("reverses the siblings at every level when descending, still placing each parent first", async () => {
    expect(await nodes(tree, "descending")).toEqual([
      "Lácteos",
      "Leches",
      "Bebidas",
      "Vinos",
      "Tintos",
      "Blancos",
      "Aguas",
    ]);
  });

  it("keeps each parent's children under it when two parents share a name", async () => {
    const items = [
      node("a", "Varios"),
      node("b", "Varios"),
      node("a1", "Zeta", "a"),
      node("b1", "Alfa", "b"),
    ];
    const { result } = await renderHook(() =>
      useTableModel({
        items,
        id: byId,
        parentId,
        columns: nodeColumns,
        sort: { column: "node", direction: "ascending" },
        onSortChange: () => {},
      }),
    );

    expect(result.current.getRowModel().rows.map((row) => row.id)).toEqual(["a", "a1", "b", "b1"]);
  });

  it("keeps every item, even one whose parent is missing or that sits in a cycle", async () => {
    expect(
      await nodes(
        [
          node("root", "Raíz"),
          node("orphan", "Huérfana", "gone"),
          node("loop-a", "Bucle A", "loop-b"),
          node("loop-b", "Bucle B", "loop-a"),
        ],
        "ascending",
      ),
    ).toEqual(["Bucle A", "Bucle B", "Huérfana", "Raíz"]);
  });

  it("lists the items in the order sortedItems gives the same tree, in either direction", async () => {
    const withCycle = [
      ...tree,
      node("root", "Raíz"),
      node("orphan", "Huérfana", "gone"),
      node("loop-a", "Bucle A", "loop-b"),
      node("loop-b", "Bucle B", "loop-a"),
    ];

    for (const items of [tree, withCycle]) {
      for (const direction of ["ascending", "descending"] as const) {
        expect(await nodes(items, direction)).toEqual(
          sortedItems(items, {
            order: textOrder((item: Node) => item.name),
            direction,
            id: byId,
            parentId,
          }).map((item) => item.name),
        );
      }
    }
  });

  it("shows a matching child together with its parents, each still in its place in the tree", async () => {
    expect(await nodes(tree, "ascending", { text: "tint", in: (item) => [item.name] })).toEqual([
      "Bebidas",
      "Vinos",
      "Tintos",
    ]);
    expect(await nodes(tree, "descending", { text: "o", in: (item) => [item.name] })).toEqual([
      "Lácteos",
      "Bebidas",
      "Vinos",
      "Tintos",
      "Blancos",
    ]);
  });

  it("shows a matching parent without its children when they do not match", async () => {
    expect(await nodes(tree, "ascending", { text: "vin", in: (item) => [item.name] })).toEqual([
      "Bebidas",
      "Vinos",
    ]);
  });
});

describe("what it accepts", () => {
  type SortableOptions = TableModelOptions<Fruit, typeof sortableColumns>;
  type PlainOptions = TableModelOptions<Fruit, typeof plainColumns>;
  type Base = { items: Fruit[]; id: (item: Fruit) => string };

  it("requires sort and onSortChange when a column is sortable", () => {
    expectTypeOf<Base & { columns: typeof sortableColumns }>().not.toExtend<SortableOptions>();
    expectTypeOf<
      Base & { columns: typeof sortableColumns; sort: TableSort<"name" | "weight"> }
    >().not.toExtend<SortableOptions>();
  });

  it("does not accept sort or onSortChange when no column is sortable", () => {
    expectTypeOf<
      Base & { columns: typeof plainColumns; sort: TableSort<string> }
    >().not.toExtend<PlainOptions>();
    expectTypeOf<
      Base & { columns: typeof plainColumns; onSortChange: (sort: TableSort<string>) => void }
    >().not.toExtend<PlainOptions>();
    expectTypeOf<Base & { columns: typeof plainColumns }>().toExtend<PlainOptions>();
  });

  it("does not accept sorting by a column that is not sortable or does not exist", () => {
    expectTypeOf<
      Base & {
        columns: typeof sortableColumns;
        sort: { column: "origin"; direction: "ascending" };
        onSortChange: (sort: TableSort<"name" | "weight">) => void;
      }
    >().not.toExtend<SortableOptions>();
    expectTypeOf<
      Base & {
        columns: typeof sortableColumns;
        sort: { column: "unknown"; direction: "ascending" };
        onSortChange: (sort: TableSort<"name" | "weight">) => void;
      }
    >().not.toExtend<SortableOptions>();
  });

  it("does not accept an empty list of columns", () => {
    expectTypeOf<readonly []>().not.toExtend<TableColumns<Fruit>>();
    expectTypeOf<readonly TableColumn<Fruit>[]>().not.toExtend<TableColumns<Fruit>>();
    expectTypeOf<typeof plainColumns>().toExtend<TableColumns<Fruit>>();
  });

  it("does not accept a non-literal boolean enableSorting, alone or beside a sortable column", () => {
    type Column<Sortable extends boolean> = TableColumn<Fruit, "name", Sortable>;
    type Options<C extends TableColumns<Fruit>> = Omit<TableModelOptions<Fruit, C>, "columns">;

    expectTypeOf<Column<boolean>>().not.toExtend<Column<false>>();
    expectTypeOf<Column<true>>().toExtend<Column<boolean>>();
    expectTypeOf<Options<[Column<boolean>]>["sort"]>().toEqualTypeOf<TableSort<"name">>();
    expectTypeOf<Options<[Column<boolean>]>["onSortChange"]>().toEqualTypeOf<
      (sort: TableSort<"name">) => void
    >();
  });

  it("falls to the safe side for a widely annotated columns array: a required handler and string ids", () => {
    const wide: readonly [TableColumn<Fruit>, ...TableColumn<Fruit>[]] = [nameColumn, originColumn];
    type Wide = TableModelOptions<Fruit, typeof wide>;

    expectTypeOf<Wide["sort"]>().toEqualTypeOf<TableSort<string>>();
    expectTypeOf<Base & { columns: typeof wide }>().not.toExtend<Wide>();
    expectTypeOf<
      Base & {
        columns: typeof wide;
        sort: TableSort<string>;
        onSortChange: (sort: TableSort<string>) => void;
      }
    >().toExtend<Wide>();
  });

  it("types the sort's column as exactly the ids of the sortable columns", () => {
    expectTypeOf<SortableOptions["sort"]>().toEqualTypeOf<TableSort<"name" | "weight">>();
  });

  it("infers the sortable ids from an inline columns array", () => {
    renderHook(() =>
      useTableModel({
        items: [] as Fruit[],
        id: byId,
        columns: [nameColumn, originColumn],
        sort: { column: "name", direction: "ascending" },
        onSortChange: (sort) => {
          expectTypeOf(sort.column).toEqualTypeOf<"name">();
        },
      }),
    );
  });
});
