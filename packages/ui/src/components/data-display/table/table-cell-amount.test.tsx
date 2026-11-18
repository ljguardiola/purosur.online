import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../test/axe";
import { staysOnOneLine } from "../../../test/text-lines";
import { Table } from "./table";
import { TableCellAmount } from "./table-cell-amount";
import { dataColumn } from "./table-columns";
import type { TableColumns, TableSort } from "./table-types";
import { useTableModel } from "./use-table-model";

type Price = { id: string; product: string; amount: string; unit?: string };

const prices: Price[] = [
  {
    id: "1",
    product: "Almendras peladas seleccionadas a granel de cosecha reciente",
    amount: "$ 1.200,00",
    unit: "/ kg",
  },
  { id: "2", product: "Miel", amount: "$ 11.760,00" },
];

const NO_SORT: TableSort = { column: "", direction: "ascending" };

const columns: TableColumns<Price> = [
  dataColumn({ id: "product", header: "Producto", render: (item: Price) => item.product }),
  dataColumn({
    id: "price",
    header: "Precio",
    align: "end",
    render: (item: Price) => <TableCellAmount amount={item.amount} unit={item.unit} />,
  }),
];

function PricesTable() {
  const table = useTableModel({
    items: prices,
    id: (item) => item.id,
    columns,
    sort: NO_SORT,
    onSortChange: () => {},
  });
  return <Table table={table} aria-label="Precios" />;
}

async function renderIn(width: number) {
  const screen = await render(
    <div style={{ width: `${width}px` }}>
      <PricesTable />
    </div>,
  );
  const cell = screen.getByRole("cell", { name: "$ 1.200,00 / kg" });
  await expect.element(cell).toBeVisible();
  return { screen, cell: cell.element() as HTMLElement };
}

function top(element: Element): number {
  return Math.round(element.getBoundingClientRect().top);
}

test("writes an amount and the unit it is per on one line when the column has room", async () => {
  const { cell } = await renderIn(1000);

  expect(staysOnOneLine(cell, "$ 1.200,00 / kg")).toBe(true);
});

test("moves the unit under the amount, keeping the amount whole and the table inside its container, when the column is short of room", async () => {
  const { screen, cell } = await renderIn(260);
  const container = screen.container.firstElementChild as HTMLElement;
  const amount = screen.getByText("$ 1.200,00", { exact: true }).element();
  const unit = screen.getByText("/ kg", { exact: true }).element();

  expect(staysOnOneLine(cell, "$ 1.200,00")).toBe(true);
  expect(top(unit)).toBeGreaterThan(top(amount));
  expect(Math.round(unit.getBoundingClientRect().right)).toBe(
    Math.round(amount.getBoundingClientRect().right),
  );
  expect(screen.getByRole("group").query()).toBeNull();
  expect(screen.getByRole("table").element().getBoundingClientRect().right).toBeLessThanOrEqual(
    container.getBoundingClientRect().right,
  );
  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the amount whole even in a container too narrow for it", async () => {
  const { cell } = await renderIn(120);

  expect(staysOnOneLine(cell, "$ 1.200,00")).toBe(true);
});

test("writes only the amount when it is per no unit", async () => {
  const { screen } = await renderIn(260);

  await expect.element(screen.getByRole("cell", { name: "$ 11.760,00" })).toBeVisible();
});
