import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { Table } from "./table";
import { TableCellAmount } from "./table-cell-amount";
import { dataColumn } from "./table-columns";
import type { TableColumns, TableSort } from "./table-types";
import { linesPainted } from "./test-support/lines-painted";
import { useTableModel } from "./use-table-model";

type Product = {
  id: string;
  name: string;
  brand: string;
  netContent: string;
  unit: string;
  amount: string;
  perUnit: string;
  state: string;
};

const NO_SORT: TableSort = { column: "", direction: "ascending" };

const products: Product[] = [
  {
    id: "1",
    brand: "",
    name: "Aceite de girasol alto oleico prensado en frio con aromas naturales sin aditivos en botella de vidrio de 900 g para uso diario en casa y en el local",
    netContent: "900 ml",
    unit: "Por unidad",
    amount: "$ 11.000,00",
    perUnit: "/ kg",
    state: "Activo",
  },
  {
    id: "2",
    brand: "",
    name: "Miel",
    netContent: "1 kg",
    unit: "Por peso",
    amount: "$ 17.500,00",
    perUnit: "/ kg",
    state: "Inactivo",
  },
];

const columns: TableColumns<Product> = [
  dataColumn({ id: "name", header: "Producto", width: 640, render: (item: Product) => item.name }),
  dataColumn({ id: "brand", header: "Marca", width: 120, render: (item: Product) => item.brand }),
  dataColumn({
    id: "netContent",
    header: "Contenido neto",
    width: 80,
    render: (item: Product) => item.netContent,
  }),
  dataColumn({ id: "unit", header: "Unidad", width: 90, render: (item: Product) => item.unit }),
  dataColumn({
    id: "price",
    header: "Precio",
    align: "end",
    render: (item: Product) => <TableCellAmount amount={item.amount} unit={item.perUnit} />,
  }),
  dataColumn({
    id: "state",
    header: "Estado",
    width: 90,
    render: (item: Product) => item.state,
  }),
];

function ProductsTable() {
  const table = useTableModel({
    items: products,
    id: (item) => item.id,
    columns,
    sort: NO_SORT,
    onSortChange: () => {},
  });
  return <Table table={table} aria-label="Productos" />;
}

function renderIn(width: number) {
  return render(
    <div style={{ width: String(width).concat("px") }}>
      <ProductsTable />
    </div>,
  );
}

test("with room to spare, keeps the short cells on one line and keeps an empty column as narrow as its header", async () => {
  const screen = await renderIn(1475);
  const row = screen.getByRole("row").nth(1).element() as HTMLElement;
  const cells = [...row.querySelectorAll("td")];

  for (const short of cells.slice(2)) {
    expect(linesPainted(short)).toBe(1);
    expect(short.getBoundingClientRect().width).toBeLessThan(190);
  }
  expect((cells[1] as HTMLElement).getBoundingClientRect().width).toBeLessThan(100);
  expect((cells[0] as HTMLElement).getBoundingClientRect().width).toBeGreaterThan(600);
});

test("in a narrower container, still fits with no sideways scroll and gives the name the most room", async () => {
  const screen = await renderIn(840);
  const table = screen.getByRole("table", { name: "Productos" }).element() as HTMLElement;
  const frame = table.closest(".isolate") as HTMLElement;
  const widths = [...(table.querySelector("tbody tr") as HTMLElement).querySelectorAll("td")].map(
    (cell) => cell.getBoundingClientRect().width,
  );

  expect(screen.getByRole("group").query()).toBeNull();
  expect(table.getBoundingClientRect().right).toBeLessThanOrEqual(
    frame.getBoundingClientRect().right,
  );
  expect(widths[0]).toBe(Math.max(...widths));
  expect(widths[1]).toBeLessThan(100);
});
