import { CircleAlert, Package, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { expect, expectTypeOf, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../test/axe";
import { Table } from "./table";
import { actionsColumn, dataColumn } from "./table-columns";
import type { TableColumns, TableProps, TableSort } from "./table-types";
import { useTableModel } from "./use-table-model";

type Lot = { id: string; name: string; origin: string; remaining: string; cost: string };

const NO_SORT: TableSort = { column: "", direction: "ascending" };

const lots: Lot[] = [
  {
    id: "1",
    name: "Compra 10/11/2026 · 1",
    origin: "Distribuidora del Valle",
    remaining: "2,000 kg",
    cost: "$ 27.599,00 / kg",
  },
  {
    id: "2",
    name: "Compra 12/11/2026 · 2",
    origin: "Molino Sur",
    remaining: "5,000 kg",
    cost: "$ 1.200,00 / kg",
  },
];

const columns: TableColumns<Lot> = [
  dataColumn({ id: "name", header: "Lote", width: 220, render: (lot: Lot) => lot.name }),
  dataColumn({ id: "origin", header: "Origen", render: (lot: Lot) => lot.origin }),
  dataColumn({
    id: "remaining",
    header: "Saldo",
    width: 150,
    align: "end",
    render: (lot: Lot) => lot.remaining,
  }),
  dataColumn({
    id: "cost",
    header: "Costo unitario",
    width: 160,
    align: "end",
    render: (lot: Lot) => lot.cost,
  }),
  actionsColumn({
    id: "actions",
    header: "Acciones",
    actions: [
      (lot: Lot) => ({ icon: <Trash2 />, "aria-label": `Quitar ${lot.name}`, onPress: () => {} }),
    ],
  }),
];

function LotsTable({
  items = lots,
  loading = false,
  failed = false,
  stackWhenNarrow = true,
}: {
  items?: Lot[];
  loading?: false | "initial" | "updating";
  failed?: boolean;
  stackWhenNarrow?: boolean;
}) {
  const table = useTableModel({
    items,
    id: (lot) => lot.id,
    columns,
    sort: NO_SORT,
    onSortChange: () => {},
  });
  const stacking = stackWhenNarrow ? ({ stackWhenNarrow: true } as const) : {};
  const empty = { icon: <Package />, title: "No hay lotes con saldo", variant: "blank" } as const;
  const failure = {
    icon: <CircleAlert />,
    title: "No se pudieron cargar los lotes",
    onRetry: () => {},
  };
  return failed ? (
    <Table table={table} aria-label="Lotes" variant="nested" {...stacking} failure={failure} />
  ) : (
    <Table
      table={table}
      aria-label="Lotes"
      variant="nested"
      {...stacking}
      loading={loading}
      empty={empty}
    />
  );
}

function ResizableLots() {
  const [width, setWidth] = useState(1000);
  return (
    <>
      <button type="button" onClick={() => setWidth(320)}>
        Achicar
      </button>
      <div style={{ width: `${width}px` }}>
        <LotsTable />
      </div>
    </>
  );
}

function inside(width: number, children: ReactNode) {
  return <div style={{ width: `${width}px` }}>{children}</div>;
}

test("stacks the rows of a stackWhenNarrow table into a list when its columns do not fit its container", async () => {
  const screen = await render(inside(320, <LotsTable />));

  expect(screen.getByRole("table").query()).toBeNull();
  expect(screen.getByRole("region").query()).toBeNull();
  const list = screen.getByRole("list", { name: "Lotes" });
  await expect.element(list).toBeVisible();
  expect(list.getByRole("listitem").elements()).toHaveLength(2);
  await expectNoAccessibilityViolations(screen.container);
});

test("titles each stacked row with its first column and pairs every other column's header with its value", async () => {
  const screen = await render(inside(320, <LotsTable />));
  const item = screen.getByRole("listitem").first().element() as HTMLElement;
  const terms = [...item.querySelectorAll("dt")].map((term) => term.textContent);
  const definitions = [...item.querySelectorAll("dd")].map((value) => value.textContent);

  expect(item.firstElementChild?.textContent).toContain("Compra 10/11/2026 · 1");
  expect(terms).toEqual(["Origen", "Saldo", "Costo unitario"]);
  expect(definitions).toEqual(["Distribuidora del Valle", "2,000 kg", "$ 27.599,00 / kg"]);
});

test("keeps a stacked row's action and values whole inside the container", async () => {
  const screen = await render(inside(320, <LotsTable />));
  const container = screen.container.firstElementChild as HTMLElement;
  const containerRect = container.getBoundingClientRect();
  const visible = [
    screen.getByRole("button", { name: "Quitar Compra 10/11/2026 · 1" }).element(),
    ...screen.getByRole("listitem").first().element().querySelectorAll("dd"),
  ];

  for (const element of visible) {
    const rect = element.getBoundingClientRect();
    expect(rect.left).toBeGreaterThanOrEqual(containerRect.left);
    expect(rect.right).toBeLessThanOrEqual(containerRect.right);
  }
});

test("keeps a table whose columns fit its container as a table", async () => {
  const screen = await render(inside(1000, <LotsTable />));

  await expect.element(screen.getByRole("table", { name: "Lotes" })).toBeVisible();
  expect(screen.getByRole("list").query()).toBeNull();
});

test("keeps a table as a table without stackWhenNarrow, however narrow its container", async () => {
  const screen = await render(inside(320, <LotsTable stackWhenNarrow={false} />));

  await expect.element(screen.getByRole("table", { name: "Lotes" })).toBeVisible();
  expect(screen.getByRole("list").query()).toBeNull();
});

test("switches to the stacked list when its container shrinks below its columns", async () => {
  const screen = await render(<ResizableLots />);
  await expect.element(screen.getByRole("table", { name: "Lotes" })).toBeVisible();

  await screen.getByRole("button", { name: "Achicar" }).click();

  await expect.element(screen.getByRole("list", { name: "Lotes" })).toBeVisible();
  expect(screen.getByRole("table").query()).toBeNull();
});

test.each([
  ["empty state", "No hay lotes con saldo", false],
  ["load failure", "No se pudieron cargar los lotes", true],
] as const)(
  "shows only its %s, whole inside the container, when stacked",
  async (_, message, failed) => {
    const screen = await render(inside(320, <LotsTable items={[]} failed={failed} />));
    const title = screen.getByText(message).first().element();
    const container = screen.container.firstElementChild as HTMLElement;

    expect(screen.getByRole("table").query()).toBeNull();
    expect(screen.getByRole("columnheader").query()).toBeNull();
    expect(title.getBoundingClientRect().left).toBeGreaterThanOrEqual(
      container.getBoundingClientRect().left,
    );
    expect(title.getBoundingClientRect().right).toBeLessThanOrEqual(
      container.getBoundingClientRect().right,
    );
    await expectNoAccessibilityViolations(screen.container);
  },
);

test("shows a list placeholder while the first load is pending, when stacked", async () => {
  const screen = await render(inside(320, <LotsTable loading="initial" />));

  await expect.element(screen.getByText("Cargando…")).toBeInTheDocument();
  expect(screen.getByRole("table").query()).toBeNull();
  expect(screen.getByRole("listitem").query()).toBeNull();
});

test("takes stackWhenNarrow or onRowPress, never both", () => {
  type Required = Pick<TableProps<Lot>, "table" | "aria-label">;
  type Press = { onRowPress: (lot: Lot) => void };

  expectTypeOf<Required & { stackWhenNarrow: true }>().toExtend<TableProps<Lot>>();
  expectTypeOf<Required & Press>().toExtend<TableProps<Lot>>();
  expectTypeOf<Required & Press & { stackWhenNarrow: false }>().toExtend<TableProps<Lot>>();
  expectTypeOf<Required & Press & { stackWhenNarrow: true }>().not.toExtend<TableProps<Lot>>();
});
