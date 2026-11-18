import { CircleAlert, Package } from "lucide-react";
import type { ReactNode } from "react";
import { expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../test/axe";
import { Table } from "./table";
import { dataColumn } from "./table-columns";
import type { TableColumns, TableSort, TableVariant } from "./table-types";
import { useTableModel } from "./use-table-model";

type Lot = { id: string; name: string; origin: string; remaining: string; cost: string };

const NO_SORT: TableSort = { column: "", direction: "ascending" };

const lot: Lot = {
  id: "1",
  name: "Compra 10/11/2026 · 1",
  origin: "Distribuidora del Valle",
  remaining: "2,000 kg",
  cost: "$ 27.599,00 / kg",
};

const lots: Lot[] = [lot];

const wideColumns: TableColumns<Lot> = [
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
];

const narrowColumns: TableColumns<Lot> = [
  dataColumn({ id: "name", header: "Lote", render: (lot: Lot) => lot.name }),
  dataColumn({
    id: "remaining",
    header: "Saldo",
    align: "end",
    render: (lot: Lot) => lot.remaining,
  }),
];

function LotsTable({
  columns,
  variant,
  items = lots,
  failed = false,
  fixedColumns = false,
  centeredFailure = false,
}: {
  columns: TableColumns<Lot>;
  variant: TableVariant;
  items?: Lot[];
  failed?: boolean;
  fixedColumns?: boolean;
  centeredFailure?: boolean;
}) {
  const table = useTableModel({
    items,
    id: (lot) => lot.id,
    columns,
    sort: NO_SORT,
    onSortChange: () => {},
  });
  return failed ? (
    <Table
      table={table}
      aria-label="Lotes"
      variant={variant}
      fixedColumns={fixedColumns}
      failure={
        centeredFailure
          ? {
              variant: "centered",
              icon: <CircleAlert />,
              title: "No se pudieron cargar los lotes",
            }
          : { icon: <CircleAlert />, title: "No se pudieron cargar los lotes", onRetry: () => {} }
      }
    />
  ) : (
    <Table
      table={table}
      aria-label="Lotes"
      variant={variant}
      fixedColumns={fixedColumns}
      empty={{ icon: <Package />, title: "No hay lotes con saldo", variant: "blank" }}
    />
  );
}

function inside(width: number, children: ReactNode) {
  return <div style={{ width: `${width}px` }}>{children}</div>;
}

test.each(["framed", "nested"] as const)(
  "scrolls a %s table whose columns are wider than its container sideways, so its last column can be reached",
  async (variant) => {
    const screen = await render(inside(320, <LotsTable columns={wideColumns} variant={variant} />));
    const region = screen.getByRole("group", { name: "Lotes" }).element() as HTMLElement;
    const lastHeader = screen
      .getByRole("columnheader", { name: "Costo unitario" })
      .element() as HTMLElement;

    expect(region.scrollWidth).toBeGreaterThan(region.clientWidth);
    region.scrollLeft = region.scrollWidth;
    await expect
      .poll(() => lastHeader.getBoundingClientRect().right)
      .toBeLessThanOrEqual(region.getBoundingClientRect().right);
    await expectNoAccessibilityViolations(screen.container);
  },
);

test("lets the keyboard scroll a table that overflows its container", async () => {
  const screen = await render(inside(320, <LotsTable columns={wideColumns} variant="nested" />));
  const region = screen.getByRole("group", { name: "Lotes" }).element() as HTMLElement;

  await userEvent.tab();

  expect(document.activeElement).toBe(region);
});

function wordsPaintedOnSeveralLines(element: HTMLElement): string[] {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const split: string[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = node as Text;
    for (const match of text.data.matchAll(/\S+/g)) {
      const range = document.createRange();
      range.setStart(text, match.index);
      range.setEnd(text, match.index + match[0].length);
      const tops = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
      if (tops.size > 1) {
        split.push(match[0]);
      }
    }
  }
  return split;
}

const longName =
  "Aceite de Girasol Elaborado con Ingredientes Cuidadosamente Seleccionados, sin Conservantes Agregado 900 g";

test("paints every word of a cell of a column with no width on one line when the columns are wider than the container", async () => {
  const screen = await render(
    inside(
      320,
      <LotsTable columns={wideColumns} variant="nested" items={[{ ...lot, origin: longName }]} />,
    ),
  );
  const cell = screen.getByRole("cell", { name: /Cuidadosamente/ }).element() as HTMLElement;

  expect(wordsPaintedOnSeveralLines(cell)).toEqual([]);
});

test("paints every word of a header title on one line when the columns are wider than the container", async () => {
  const columns: TableColumns<Lot> = [
    dataColumn({ id: "name", header: "Lote", width: 220, render: (lot: Lot) => lot.name }),
    dataColumn({
      id: "origin",
      header: "Responsabilidad compartida",
      render: (lot: Lot) => lot.origin,
    }),
    dataColumn({ id: "cost", header: "Costo", width: 160, render: (lot: Lot) => lot.cost }),
  ];
  const screen = await render(inside(320, <LotsTable columns={columns} variant="nested" />));
  const header = screen
    .getByRole("columnheader", { name: "Responsabilidad compartida" })
    .element() as HTMLElement;

  expect(wordsPaintedOnSeveralLines(header)).toEqual([]);
});

test("grows a column whose declared width is narrower than its longest word to fit that word", async () => {
  const columns: TableColumns<Lot> = [
    dataColumn({ id: "name", header: "Lote", width: 220, render: (lot: Lot) => lot.name }),
    dataColumn({ id: "origin", header: "Origen", width: 40, render: (lot: Lot) => lot.origin }),
    dataColumn({ id: "cost", header: "Costo", width: 160, render: (lot: Lot) => lot.cost }),
  ];
  const screen = await render(
    inside(
      320,
      <LotsTable
        columns={columns}
        variant="nested"
        items={[{ ...lot, origin: "Cuidadosamente" }]}
      />,
    ),
  );
  const cell = screen.getByRole("cell", { name: "Cuidadosamente" }).element() as HTMLElement;

  expect(wordsPaintedOnSeveralLines(cell)).toEqual([]);
});

test("squeezes a column with no width of a fixedColumns table below the readable minimum, with no scrolling region", async () => {
  const screen = await render(
    inside(320, <LotsTable columns={squeezableColumns} variant="nested" fixedColumns />),
  );
  const container = screen.container.firstElementChild as HTMLElement;
  const lastHeader = screen
    .getByRole("columnheader", { name: "Costo unitario" })
    .element() as HTMLElement;
  const origin = screen.getByRole("columnheader", { name: "Origen" }).element() as HTMLElement;

  expect(screen.getByRole("group").query()).toBeNull();
  expect(lastHeader.getBoundingClientRect().right).toBeLessThanOrEqual(
    container.getBoundingClientRect().right,
  );
  expect(origin.getBoundingClientRect().width).toBeLessThan(120);
});

test("adds no scrolling region when the columns fit their container", async () => {
  const screen = await render(inside(320, <LotsTable columns={narrowColumns} variant="nested" />));

  expect(screen.getByRole("group").query()).toBeNull();
  const table = screen.getByRole("table", { name: "Lotes" }).element() as HTMLElement;
  expect(table.getBoundingClientRect().width).toBe(320);
});

test.each([
  ["empty state", "No hay lotes con saldo", false],
  ["load failure", "No se pudieron cargar los lotes", true],
] as const)(
  "keeps its %s whole in view inside a container narrower than its columns, under headers that keep their width",
  async (_, message, failed) => {
    const screen = await render(
      inside(200, <LotsTable columns={wideColumns} variant="nested" items={[]} failed={failed} />),
    );
    const title = screen.getByText(message).first().element();
    const container = screen.container.firstElementChild as HTMLElement;
    const region = screen.getByRole("group", { name: "Lotes" }).element() as HTMLElement;

    region.scrollLeft = region.scrollWidth;
    await expect.poll(() => region.scrollLeft).toBeGreaterThan(0);
    expect(title.getBoundingClientRect().left).toBeGreaterThanOrEqual(
      container.getBoundingClientRect().left,
    );
    expect(title.getBoundingClientRect().right).toBeLessThanOrEqual(
      container.getBoundingClientRect().right,
    );
    await expectNoAccessibilityViolations(screen.container);
  },
);

test.each([
  ["empty state", "No hay lotes con saldo", false],
  ["centered load failure", "No se pudieron cargar los lotes", true],
] as const)(
  "keeps the %s of a fixedColumns table whole inside its container",
  async (_, message, failed) => {
    const screen = await render(
      inside(
        320,
        <LotsTable
          columns={squeezableColumns}
          variant="nested"
          items={[]}
          failed={failed}
          fixedColumns
          centeredFailure
        />,
      ),
    );
    const title = screen.getByText(message).last().element();
    const container = screen.container.firstElementChild as HTMLElement;

    expect(title.getBoundingClientRect().left).toBeGreaterThanOrEqual(
      container.getBoundingClientRect().left,
    );
    expect(title.getBoundingClientRect().right).toBeLessThanOrEqual(
      container.getBoundingClientRect().right,
    );
    await expectNoAccessibilityViolations(screen.container);
  },
);

const squeezableColumns: TableColumns<Lot> = [
  dataColumn({ id: "name", header: "Lote", width: 120, render: (lot: Lot) => lot.name }),
  dataColumn({ id: "origin", header: "Origen", render: (lot: Lot) => lot.origin }),
  dataColumn({
    id: "cost",
    header: "Costo unitario",
    width: 120,
    align: "end",
    render: (lot: Lot) => lot.cost,
  }),
];

function FilledLotsTable({ items, failed }: { items: Lot[]; failed: boolean }) {
  const table = useTableModel({
    items,
    id: (lot) => lot.id,
    columns: squeezableColumns,
    sort: NO_SORT,
    onSortChange: () => {},
  });
  return failed ? (
    <Table
      table={table}
      aria-label="Lotes"
      fill
      failureKeepsHeaders
      failure={{
        icon: <CircleAlert />,
        title: "No se pudieron cargar los lotes",
        onRetry: () => {},
      }}
    />
  ) : (
    <Table
      table={table}
      aria-label="Lotes"
      fill
      emptyKeepsHeaders
      empty={{ icon: <Package />, title: "No hay lotes con saldo", variant: "blank" }}
    />
  );
}

test.each([
  ["rows", lots, false],
  ["empty state kept under its headers", [], false],
  ["load failure kept under its headers", [], true],
] as const)(
  "squeezes the columns of a filling table narrower than its columns to fit its container, showing its %s",
  async (_, items, failed) => {
    const screen = await render(
      <div style={{ width: "320px", height: "400px" }}>
        <FilledLotsTable items={[...items]} failed={failed} />
      </div>,
    );
    const container = screen.container.firstElementChild as HTMLElement;
    const lastHeader = screen
      .getByRole("columnheader", { name: "Costo unitario" })
      .element() as HTMLElement;

    expect(lastHeader.getBoundingClientRect().right).toBeLessThanOrEqual(
      container.getBoundingClientRect().right,
    );
  },
);
