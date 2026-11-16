import { Trash2 } from "lucide-react";
import { beforeEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Table } from "./table";
import { actionsColumn, dataColumn } from "./table-columns";
import type { TableColumns, TableSort } from "./table-types";
import { useTableModel } from "./use-table-model";

type Balance = {
  id: string;
  product: string;
  balance: string;
  unitCost: string;
  value: string;
  lots: string;
};

const NO_SORT: TableSort = { column: "", direction: "ascending" };

const longName =
  "Aceite de Girasol Elaborado con Ingredientes Cuidadosamente Seleccionados, sin Conservantes Agregado 900 g";

const balances: Balance[] = [
  {
    id: "1",
    product: longName,
    balance: "12,150 kg",
    unitCost: "$ 27.599,00 / kg",
    value: "$ 335.328,00",
    lots: "3",
  },
];

const columns: TableColumns<Balance> = [
  dataColumn({ id: "product", header: "Producto", render: (item: Balance) => item.product }),
  dataColumn({
    id: "balance",
    header: "Saldo",
    width: 150,
    align: "end",
    render: (item: Balance) => item.balance,
  }),
  dataColumn({
    id: "unitCost",
    header: "Costo unitario",
    width: 160,
    align: "end",
    render: (item: Balance) => item.unitCost,
  }),
  dataColumn({
    id: "value",
    header: "Valorizado",
    width: 170,
    align: "end",
    render: (item: Balance) => item.value,
  }),
  dataColumn({
    id: "lots",
    header: "Lotes",
    width: 110,
    align: "end",
    render: (item: Balance) => item.lots,
  }),
  actionsColumn({
    id: "actions",
    header: "Acciones",
    actions: [
      () => ({ icon: <Trash2 />, "aria-label": "Quitar", onPress: () => {} }),
      () => ({ icon: <Trash2 />, "aria-label": "Ajustar", onPress: () => {} }),
      () => ({ icon: <Trash2 />, "aria-label": "Contar", onPress: () => {} }),
    ],
  }),
];

function BalancesTable() {
  const table = useTableModel({
    items: balances,
    id: (item) => item.id,
    columns,
    sort: NO_SORT,
    onSortChange: () => {},
  });
  return <Table table={table} aria-label="Saldos" />;
}

beforeEach(async () => {
  await page.viewport(1280, 900);
});

function linesPainted(element: HTMLElement): number {
  const range = document.createRange();
  range.selectNodeContents(element);
  return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
}

function wordsPaintedOnSeveralLines(element: HTMLElement): string[] {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const split: string[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = node as Text;
    for (const match of text.data.matchAll(/\S+/g)) {
      const range = document.createRange();
      range.setStart(text, match.index);
      range.setEnd(text, match.index + match[0].length);
      if (new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size > 1) {
        split.push(match[0]);
      }
    }
  }
  return split;
}

async function renderBeside(width: number) {
  return render(
    <div style={{ width: `${width}px` }}>
      <BalancesTable />
    </div>,
  );
}

test("fits columns whose declared widths add up to more than the container, since each longest word still fits", async () => {
  const screen = await renderBeside(880);
  const container = screen.container.firstElementChild as HTMLElement;
  const table = screen.getByRole("table", { name: "Saldos" }).element() as HTMLElement;

  expect(screen.getByRole("region").query()).toBeNull();
  expect(table.getBoundingClientRect().width).toBe(container.getBoundingClientRect().width);
});

test("gives a long name column the room the figures do not need, so the name wraps on a few lines", async () => {
  const screen = await renderBeside(880);
  const name = screen.getByRole("cell", { name: /Cuidadosamente/ }).element() as HTMLElement;

  expect(linesPainted(name)).toBeLessThanOrEqual(3);
});

test("makes the name column wider than any column of figures", async () => {
  const screen = await renderBeside(880);
  const widthOf = (title: string) =>
    screen.getByRole("columnheader", { name: title }).element().getBoundingClientRect().width;

  for (const figures of ["Saldo", "Costo unitario", "Valorizado", "Lotes"]) {
    expect(widthOf("Producto")).toBeGreaterThan(widthOf(figures));
  }
});

test("keeps every word of the figures whole beside a long name", async () => {
  const screen = await renderBeside(880);
  const row = screen.getByRole("row").nth(1).element() as HTMLElement;

  expect(wordsPaintedOnSeveralLines(row)).toEqual([]);
});
