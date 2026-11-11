import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../test/axe";
import { Table } from "./table";
import { dataColumn } from "./table-columns";
import type { TableColumns, TableProps, TableSort } from "./table-types";
import { useTableModel } from "./use-table-model";

type Line = { id: string; name: string; amount: string };

const columns: TableColumns<Line> = [
  dataColumn({ id: "name", header: "Producto", render: (line: Line) => line.name }),
  dataColumn({
    id: "amount",
    header: "Importe",
    align: "end",
    render: (line: Line) => line.amount,
  }),
];

const lines: Line[] = [
  { id: "1", name: "Almendras peladas", amount: "$ 6.142,50" },
  { id: "2", name: "Avena arrollada", amount: "$ 3.200,00" },
];

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

const noSort: TableSort = { column: "", direction: "ascending" };

function LinesTable(props: DistributiveOmit<TableProps<Line>, "table" | "aria-label">) {
  const table = useTableModel({
    items: lines,
    id: (line) => line.id,
    columns,
    sort: noSort,
    onSortChange: () => {},
  });
  return <Table table={table} aria-label="Líneas" {...props} />;
}

const locked = { label: "Líneas bloqueadas" };

test("shows a lock icon named by the given label in the first header cell, before its title", async () => {
  const screen = await render(<LinesTable locked={locked} />);

  const header = screen.getByRole("columnheader", { name: /Producto/ }).element();
  const icon = screen.getByRole("img", { name: "Líneas bloqueadas" }).element();
  expect(header.contains(icon)).toBe(true);
  expect(icon.getBoundingClientRect().right).toBeLessThanOrEqual(
    screen.getByText("Producto").element().getBoundingClientRect().left,
  );
  await expectNoAccessibilityViolations(screen.container);
});

test("shows no lock icon when it is not locked", async () => {
  const screen = await render(<LinesTable />);

  expect(screen.container.querySelector("[role=img]")).toBeNull();
});

test("keeps showing every row, dimmed", async () => {
  const screen = await render(<LinesTable locked={locked} />);

  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  await expect.element(screen.getByText("$ 3.200,00")).toBeVisible();
  const body = screen.container.querySelector("tbody") as HTMLElement;
  expect(Number(getComputedStyle(body).opacity)).toBeLessThan(1);
});

test("does not dim the rows when it is not locked", async () => {
  const screen = await render(<LinesTable />);

  const body = screen.container.querySelector("tbody") as HTMLElement;
  expect(Number(getComputedStyle(body).opacity)).toBe(1);
});

test("ignores a press on a row while locked", async () => {
  const onRowPress = vi.fn();
  const screen = await render(<LinesTable locked={locked} onRowPress={onRowPress} />);

  await screen.getByText("Avena arrollada").click();

  expect(onRowPress).not.toHaveBeenCalled();
});

test("shows no key legend while locked", async () => {
  const screen = await render(
    <LinesTable locked={locked} legend={[{ keyName: "F2", label: "Buscar" }]} />,
  );

  expect(screen.container.querySelector("kbd")).toBeNull();
});
