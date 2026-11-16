import { Trash2 } from "lucide-react";
import { beforeEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Table } from "./table";
import { TableCellText } from "./table-cell-text";
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

  expect(screen.getByRole("group").query()).toBeNull();
  expect(table.getBoundingClientRect().right).toBeLessThanOrEqual(
    container.getBoundingClientRect().right,
  );
});

test("gives a long name column the room the figures do not need, so the name wraps on a few lines", async () => {
  const screen = await renderBeside(880);
  const name = screen.getByRole("cell", { name: /Cuidadosamente/ }).element() as HTMLElement;

  expect(linesPainted(name)).toBeLessThanOrEqual(4);
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

test("paints each figure of an end-aligned column on a single line, taking its content width", async () => {
  const screen = await renderBeside(880);
  const row = screen.getByRole("row").nth(1).element() as HTMLElement;

  for (const figure of ["12,150 kg", "$ 27.599,00 / kg", "$ 335.328,00"]) {
    const cell = [...row.querySelectorAll("td")].find((td) => td.textContent === figure);
    expect(cell).toBeDefined();
    expect(linesPainted(cell as HTMLElement)).toBe(1);
  }
});

type Coded = { id: string; name: string; sku: string; document: string };

const codedItems: Coded[] = [
  {
    id: "1",
    name: "Aceite de Girasol Elaborado con Ingredientes Cuidadosamente Seleccionados",
    sku: "SKU-001-AZUL",
    document: "FA-B 0001-00001234",
  },
];

const codedColumns: TableColumns<Coded> = [
  dataColumn({ id: "name", header: "Producto", render: (item: Coded) => item.name }),
  dataColumn({ id: "sku", header: "Código", code: true, render: (item: Coded) => item.sku }),
  dataColumn({
    id: "document",
    header: "Comprobante",
    code: true,
    render: (item: Coded) => item.document,
  }),
];

function CodedTable() {
  const table = useTableModel({
    items: codedItems,
    id: (item) => item.id,
    columns: codedColumns,
    sort: NO_SORT,
    onSortChange: () => {},
  });
  return <Table table={table} aria-label="Códigos" />;
}

test.each([600, 420, 200])(
  "paints a code column's values on one line, even at a hyphen, in a container %ipx wide",
  async (width) => {
    const screen = await render(
      <div style={{ width: String(width).concat("px") }}>
        <CodedTable />
      </div>,
    );
    const row = screen.getByRole("row").nth(1).element() as HTMLElement;
    const [, sku, document] = [...row.querySelectorAll("td")];

    expect(linesPainted(sku as HTMLElement)).toBe(1);
    expect(linesPainted(document as HTMLElement)).toBe(1);
  },
);

test("lets the flexible column give way to the code columns", async () => {
  const screen = await render(
    <div style={{ width: "600px" }}>
      <CodedTable />
    </div>,
  );

  expect(screen.getByRole("group").query()).toBeNull();
  const name = screen.getByRole("cell", { name: /Cuidadosamente/ }).element() as HTMLElement;
  expect(linesPainted(name)).toBeGreaterThan(1);
});

type Voucher = { id: string; number: string; detail: string };

const voucherColumns: TableColumns<Voucher> = [
  dataColumn({
    id: "voucher",
    header: "Comprobante",
    code: true,
    render: (item: Voucher) => (
      <TableCellText description={item.detail}>{item.number}</TableCellText>
    ),
  }),
];

function VouchersTable() {
  const table = useTableModel({
    items: [
      {
        id: "1",
        number: "Nota de crédito C 00003-00000041",
        detail: "Caja principal · Anula la Factura C 00003-00000040 · en contingencia",
      },
    ],
    id: (item) => item.id,
    columns: voucherColumns,
    sort: NO_SORT,
    onSortChange: () => {},
  });
  return <Table table={table} aria-label="Comprobantes" />;
}

test("wraps the description under a code while the code itself stays on one line", async () => {
  const screen = await render(
    <div style={{ width: "320px" }}>
      <VouchersTable />
    </div>,
  );

  const number = screen.getByText("Nota de crédito C 00003-00000041").element() as HTMLElement;
  const detail = screen.getByText(/Anula la Factura/).element() as HTMLElement;
  expect(linesPainted(number)).toBe(1);
  expect(linesPainted(detail)).toBeGreaterThan(1);
  expect(screen.getByRole("group").query()).toBeNull();
});

type Priced = { id: string; name: string; price: string; sku: string };

const narrowlyDeclaredColumns: TableColumns<Priced> = [
  dataColumn({ id: "name", header: "Producto", render: (item: Priced) => item.name }),
  dataColumn({
    id: "price",
    header: "Precio",
    width: 40,
    align: "end",
    render: (item: Priced) => item.price,
  }),
  dataColumn({
    id: "sku",
    header: "Código",
    width: 40,
    code: true,
    render: (item: Priced) => item.sku,
  }),
];

function NarrowlyDeclaredTable() {
  const table = useTableModel({
    items: [{ id: "1", name: longName, price: "$ 335.328,00", sku: "SKU-001-AZUL" }],
    id: (item) => item.id,
    columns: narrowlyDeclaredColumns,
    sort: NO_SORT,
    onSortChange: () => {},
  });
  return <Table table={table} aria-label="Precios" />;
}

test.each(["$ 335.328,00", "SKU-001-AZUL"])(
  "paints %s, wider than the width its column declares, inside its own cell",
  async (value) => {
    const screen = await render(
      <div style={{ width: "600px" }}>
        <NarrowlyDeclaredTable />
      </div>,
    );

    const cell = screen.getByRole("cell", { name: value }).element() as HTMLElement;
    const text = document.createRange();
    text.selectNodeContents(cell);
    expect(text.getBoundingClientRect().right).toBeLessThanOrEqual(
      cell.getBoundingClientRect().right,
    );
    expect(text.getBoundingClientRect().left).toBeGreaterThanOrEqual(
      cell.getBoundingClientRect().left,
    );
  },
);
