import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
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

const noSort: TableSort = { column: "", direction: "ascending" };

function LinesTable(props: Partial<TableProps<Line>>) {
  const table = useTableModel({
    items: lines,
    id: (line) => line.id,
    columns,
    sort: noSort,
    onSortChange: () => {},
  });
  return <Table table={table} aria-label="Líneas" {...props} />;
}

test("keeps showing every row and the header, fading only the rows", async () => {
  const screen = await render(<LinesTable inactive />);

  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  await expect.element(screen.getByRole("columnheader", { name: "Producto" })).toBeVisible();
  const body = screen.container.querySelector("tbody") as HTMLElement;
  const head = screen.container.querySelector("thead") as HTMLElement;
  expect(Number(getComputedStyle(body).opacity)).toBeLessThan(1);
  expect(Number(getComputedStyle(head).opacity)).toBe(1);
});

test("adds no lock icon to the header", async () => {
  const screen = await render(<LinesTable inactive />);

  expect(screen.container.querySelector("[role=img]")).toBeNull();
});

test("does not fade the rows unless it is inactive", async () => {
  const screen = await render(<LinesTable />);

  const body = screen.container.querySelector("tbody") as HTMLElement;
  expect(Number(getComputedStyle(body).opacity)).toBe(1);
});

test("ignores a press on a row and marks the rows disabled while inactive", async () => {
  const onRowPress = vi.fn();
  const screen = await render(<LinesTable inactive onRowPress={onRowPress} />);

  await screen.getByText("Avena arrollada").click();

  expect(onRowPress).not.toHaveBeenCalled();
  expect(screen.container.querySelector("tbody tr[aria-disabled='true']")).not.toBeNull();
});

test("presses a row when it is not inactive", async () => {
  const onRowPress = vi.fn();
  const screen = await render(<LinesTable onRowPress={onRowPress} />);

  await screen.getByText("Avena arrollada").click();

  expect(onRowPress).toHaveBeenCalledWith(lines[1]);
});
