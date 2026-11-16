import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { Table } from "./table";
import { TableCellAmount } from "./table-cell-amount";
import { dataColumn } from "./table-columns";
import type { TableColumns, TableSort } from "./table-types";
import { useTableModel } from "./use-table-model";

type Product = {
  id: string;
  name: string;
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
    name: "Aceite de Girasol Elaborado con Ingredientes Cuidadosamente Seleccionados, sin Conservantes Agregados, Envasado en Botella de Vidrio de 900 g para Gastronomía",
    netContent: "900 ml",
    unit: "Por unidad",
    amount: "$ 11.000,00",
    perUnit: "/ kg",
    state: "Activo",
  },
  {
    id: "2",
    name: "Miel",
    netContent: "1 kg",
    unit: "Por peso",
    amount: "$ 17.500,00",
    perUnit: "/ kg",
    state: "Inactivo",
  },
];

const columns: TableColumns<Product> = [
  dataColumn({ id: "name", header: "Producto", grow: true, render: (item: Product) => item.name }),
  dataColumn({
    id: "netContent",
    header: "Contenido neto",
    render: (item: Product) => item.netContent,
  }),
  dataColumn({ id: "unit", header: "Unidad", render: (item: Product) => item.unit }),
  dataColumn({
    id: "price",
    header: "Precio",
    align: "end",
    render: (item: Product) => <TableCellAmount amount={item.amount} unit={item.perUnit} />,
  }),
  dataColumn({ id: "state", header: "Estado", render: (item: Product) => item.state }),
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

function linesPainted(element: HTMLElement): number {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const tops = new Set<number>();
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) {
      tops.add(Math.round(rect.top));
    }
  }
  return tops.size;
}

function renderIn(width: number) {
  return render(
    <div style={{ width: String(width).concat("px") }}>
      <ProductsTable />
    </div>,
  );
}

test("with room to spare, keeps the short cells on one line and gives the growing column only what is left", async () => {
  const screen = await renderIn(1475);
  const row = screen.getByRole("row").nth(1).element() as HTMLElement;
  const cells = [...row.querySelectorAll("td")];

  for (const short of cells.slice(1)) {
    expect(linesPainted(short)).toBe(1);
  }
  const shortWidths = cells
    .slice(1)
    .reduce((sum, cell) => sum + cell.getBoundingClientRect().width, 0);
  const name = cells[0] as HTMLElement;
  expect(name.getBoundingClientRect().width).toBeGreaterThan(1475 - shortWidths - 2);
  for (const short of cells.slice(1)) {
    expect(short.getBoundingClientRect().width).toBeLessThan(190);
  }
});

test("when the table would not fit otherwise, lets the short cells wrap and still fits with no sideways scroll", async () => {
  const screen = await renderIn(640);
  const table = screen.getByRole("table", { name: "Productos" }).element() as HTMLElement;
  const frame = table.closest(".isolate") as HTMLElement;

  expect(screen.getByRole("group").query()).toBeNull();
  expect(table.getBoundingClientRect().right).toBeLessThanOrEqual(
    frame.getBoundingClientRect().right,
  );
});
