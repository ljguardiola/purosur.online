import { describe, expect, expectTypeOf, it } from "vitest";
import { actionsColumn, dataColumn } from "./table-columns";
import type { TableAction, TableColumn, TableColumnMeta, TableProps } from "./table-types";

type Product = { id: string; name: string };

type Accepts<F, Options> = F extends (options: Options) => unknown ? true : false;

const sortOrder = (a: Product, b: Product) => a.name.localeCompare(b.name);

describe("dataColumn", () => {
  it("is a column with its id and title, whose cell renders the item", () => {
    const column = dataColumn({
      id: "name",
      header: "Producto",
      render: (product: Product) => product.name,
    });

    expect(column.id).toBe("name");
    expect(column.header).toBe("Producto");
    expect(column.enableSorting).toBe(false);
    expect(column.meta).toEqual({});
  });

  it("carries the alignment and the order the column sorts by", () => {
    const column = dataColumn({
      id: "name",
      header: "Producto",
      align: "end",
      sort: { order: sortOrder, firstDirection: "descending" },
      render: (product: Product) => product.name,
    });

    expect(column.meta).toEqual({ align: "end" });
    expect(column.enableSorting).toBe(true);
    expect(column.sortDescFirst).toBe(true);
  });

  it("is sortable only when it has an order, and says so in its type", () => {
    const plain = dataColumn({ id: "a", header: "A", render: (p: Product) => p.name });
    const sortable = dataColumn({
      id: "b",
      header: "B",
      sort: { order: sortOrder, firstDirection: "ascending" },
      render: (p: Product) => p.name,
    });

    expectTypeOf(plain).toEqualTypeOf<TableColumn<Product, "a", false>>();
    expectTypeOf(sortable).toEqualTypeOf<TableColumn<Product, "b", true>>();
  });

  it("does not accept a column without a title, an id or a way to render", () => {
    type Render = (item: Product) => string;

    expectTypeOf<
      Accepts<typeof dataColumn<Product, "name">, { id: "name"; header: string; render: Render }>
    >().toEqualTypeOf<true>();
    expectTypeOf<
      Accepts<typeof dataColumn<Product, "name">, { id: "name"; render: Render }>
    >().toEqualTypeOf<false>();
    expectTypeOf<
      Accepts<typeof dataColumn<Product, "name">, { header: string; render: Render }>
    >().toEqualTypeOf<false>();
    expectTypeOf<
      Accepts<typeof dataColumn<Product, "name">, { id: "name"; header: string }>
    >().toEqualTypeOf<false>();
  });

  it("does not accept a sort without its first direction or without its order", () => {
    type Base = { id: "name"; header: string; render: (item: Product) => string };
    type Column = typeof dataColumn<Product, "name">;

    expectTypeOf<
      Accepts<Column, Base & { sort: { order: typeof sortOrder; firstDirection: "ascending" } }>
    >().toEqualTypeOf<true>();
    expectTypeOf<
      Accepts<Column, Base & { sort: { order: typeof sortOrder } }>
    >().toEqualTypeOf<false>();
    expectTypeOf<
      Accepts<Column, Base & { sort: { firstDirection: "ascending" } }>
    >().toEqualTypeOf<false>();
  });
});

describe("actionsColumn", () => {
  const edit: TableAction<Product> = () => undefined;

  it("is an unsortable column that tells how many actions it holds", () => {
    const one = actionsColumn({ id: "actions", header: "Acciones", actions: [edit] });
    const two = actionsColumn({ id: "actions", header: "Acciones", actions: [edit, edit] });

    expect(one.enableSorting).toBe(false);
    expect(one.meta).toEqual({ actionCount: 1 });
    expect(two.meta).toEqual({ actionCount: 2 });
    expectTypeOf(one).toEqualTypeOf<TableColumn<Product, "actions", false>>();
  });

  it("does not accept zero or three actions, or a column without a title", () => {
    type Column = typeof actionsColumn<Product, "actions">;
    type Edit = TableAction<Product>;

    expectTypeOf<
      Accepts<Column, { id: "actions"; header: string; actions: [Edit, Edit] }>
    >().toEqualTypeOf<true>();
    expectTypeOf<
      Accepts<Column, { id: "actions"; header: string; actions: [] }>
    >().toEqualTypeOf<false>();
    expectTypeOf<
      Accepts<Column, { id: "actions"; header: string; actions: [Edit, Edit, Edit] }>
    >().toEqualTypeOf<false>();
    expectTypeOf<Accepts<Column, { id: "actions"; actions: [Edit] }>>().toEqualTypeOf<false>();
  });

  it("keeps the column meta to what the table reads", () => {
    expectTypeOf<TableColumnMeta>().toEqualTypeOf<{
      align?: "start" | "end";
      actionCount?: 1 | 2;
    }>();
  });
});

describe("Table props", () => {
  it("does not accept a failure together with a loading state", () => {
    type Base = { table: TableProps<Product>["table"]; "aria-label": string };
    type Failure = Extract<TableProps<Product>, { failure: unknown }>["failure"];

    expectTypeOf<Base & { loading: "initial"; failure: Failure }>().not.toExtend<
      TableProps<Product>
    >();
    expectTypeOf<Base & { failure: Failure }>().toExtend<TableProps<Product>>();
  });

  it("does not accept a table without an accessible name or without its table model", () => {
    type Model = TableProps<Product>["table"];

    expectTypeOf<{ table: Model }>().not.toExtend<TableProps<Product>>();
    expectTypeOf<{ "aria-label": string }>().not.toExtend<TableProps<Product>>();
  });
});
