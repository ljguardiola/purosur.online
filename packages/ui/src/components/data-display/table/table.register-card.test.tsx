import { Barcode, TriangleAlert } from "lucide-react";
import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../test/axe";
import { tokenRgb } from "../../../test/token-colors";
import type { KeyLegendItem } from "../key-legend";
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
  { id: "3", name: "Pasas de uva", amount: "$ 1.950,00" },
];

const legend: readonly KeyLegendItem[] = [
  { keyName: "ArrowUpDown", label: "Líneas" },
  { keyName: "F2", label: "Buscar" },
  { keyName: "Delete", label: "Quitar" },
];

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

const noSort: TableSort = { column: "", direction: "ascending" };

function LinesTable({
  items = lines,
  ...tableProps
}: DistributiveOmit<TableProps<Line>, "table" | "aria-label"> & { items?: readonly Line[] }) {
  const table = useTableModel({
    items,
    id: (line) => line.id,
    columns,
    sort: noSort,
    onSortChange: () => {},
  });
  return <Table table={table} aria-label="Líneas" {...tableProps} />;
}

function card(inside: Element): HTMLElement {
  let element = inside.parentElement as HTMLElement;
  while (getComputedStyle(element).borderTopWidth !== "1px") {
    element = element.parentElement as HTMLElement;
  }
  return element;
}

const emptyState = { icon: <Barcode />, title: "La venta está vacía", variant: "blank" } as const;

const failure = {
  variant: "centered",
  icon: <TriangleAlert />,
  title: "No se pudo cargar la venta",
  description: "Volvé a intentarlo en unos segundos.",
} as const;

test("draws its key legend as the footer inside the card, under the last row", async () => {
  const screen = await render(<LinesTable legend={legend} />);

  const cardBox = card(screen.getByRole("table").element()).getBoundingClientRect();
  const footer = screen.getByRole("list").element() as HTMLElement;
  const footerBox = footer.getBoundingClientRect();
  const lastRow = screen.getByRole("row").last().element().getBoundingClientRect();
  expect(screen.getByRole("listitem").elements()).toHaveLength(3);
  expect(footerBox.top).toBeGreaterThanOrEqual(lastRow.bottom);
  expect(footerBox.bottom).toBeLessThanOrEqual(cardBox.bottom);
  expect(footerBox.left).toBeGreaterThanOrEqual(cardBox.left);
  await expectNoAccessibilityViolations(screen.container);
});

test("sets the legend apart with a subtle band and a divider above it", async () => {
  const screen = await render(<LinesTable legend={legend} />);

  const band = screen.getByRole("list").element().parentElement as HTMLElement;
  expect(getComputedStyle(band).backgroundColor).toBe(tokenRgb("surface-subtle"));
  expect(getComputedStyle(band).borderTopWidth).toBe("1px");
  expect(getComputedStyle(band).borderTopColor).toBe(tokenRgb("border"));
});

test("draws no legend when it is not given", async () => {
  const screen = await render(<LinesTable />);

  expect(screen.container.querySelector("ul")).toBeNull();
});

test("keeps its legend while the card shows the empty state or the failure", async () => {
  const empty = await render(<LinesTable fill items={[]} empty={emptyState} legend={legend} />);
  expect(empty.getByRole("listitem").elements()).toHaveLength(3);
  await empty.unmount();

  const failed = await render(<LinesTable fill failure={failure} legend={legend} />);
  expect(failed.getByRole("listitem").elements()).toHaveLength(3);
});

test("fills the height its parent gives it, keeping the legend at the bottom of the card", async () => {
  const screen = await render(
    <div style={{ height: 480, width: 600 }}>
      <LinesTable fill legend={legend} />
    </div>,
  );

  const cardBox = card(screen.getByRole("table").element()).getBoundingClientRect();
  const footerBox = (
    screen.getByRole("list").element().parentElement as HTMLElement
  ).getBoundingClientRect();
  expect(cardBox.height).toBe(480);
  expect(cardBox.bottom - footerBox.bottom).toBeLessThanOrEqual(1);
});

test("keeps its natural height when it does not fill", async () => {
  const screen = await render(
    <div style={{ height: 480, width: 600 }}>
      <LinesTable legend={legend} />
    </div>,
  );

  expect(card(screen.getByRole("table").element()).getBoundingClientRect().height).toBeLessThan(
    300,
  );
});

test("scrolls the rows inside the card instead of growing it when there are more than fit", async () => {
  const many = Array.from({ length: 30 }, (_, index) => ({
    id: String(index),
    name: `Producto ${index}`,
    amount: "$ 1,00",
  }));
  const screen = await render(
    <div style={{ height: 300, width: 600 }}>
      <LinesTable fill items={many} legend={legend} />
    </div>,
  );

  const cardBox = card(screen.getByRole("table").element()).getBoundingClientRect();
  expect(cardBox.height).toBe(300);
  const footerBox = screen.getByRole("list").element().getBoundingClientRect();
  expect(footerBox.bottom).toBeLessThanOrEqual(cardBox.bottom);
});

test("centers the empty state in the card body, with no column header", async () => {
  const screen = await render(
    <div style={{ height: 480, width: 600 }}>
      <LinesTable fill items={[]} empty={emptyState} legend={legend} />
    </div>,
  );

  expect(screen.getByRole("columnheader").elements()).toHaveLength(0);
  const cardBox = card(screen.container.querySelector("p") as HTMLElement).getBoundingClientRect();
  const footerBox = (
    screen.getByRole("list").element().parentElement as HTMLElement
  ).getBoundingClientRect();
  const title = screen.getByText("La venta está vacía").element();
  const block = title.parentElement as HTMLElement;
  const blockBox = block.getBoundingClientRect();
  const above = blockBox.top - cardBox.top;
  const below = footerBox.top - blockBox.bottom;
  expect(Math.abs(above - below)).toBeLessThanOrEqual(2);
  const titleBox = title.getBoundingClientRect();
  expect(
    Math.abs(titleBox.left + titleBox.width / 2 - (cardBox.left + cardBox.width / 2)),
  ).toBeLessThanOrEqual(1);
  await expectNoAccessibilityViolations(screen.container);
});

test("centers the failure in the card body, with no column header and no retry button", async () => {
  const screen = await render(
    <div style={{ height: 480, width: 600 }}>
      <LinesTable fill failure={failure} legend={legend} />
    </div>,
  );

  expect(screen.getByRole("columnheader").elements()).toHaveLength(0);
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("No se pudo cargar la venta Volvé a intentarlo en unos segundos.");
  expect(screen.getByRole("button").elements()).toHaveLength(0);
  const cardBox = card(screen.getByRole("alert").element()).getBoundingClientRect();
  const alertBox = (
    screen.getByText("No se pudo cargar la venta").element().parentElement as HTMLElement
  ).getBoundingClientRect();
  const footerBox = (
    screen.getByRole("list").element().parentElement as HTMLElement
  ).getBoundingClientRect();
  expect(
    Math.abs(alertBox.top - cardBox.top - (footerBox.top - alertBox.bottom)),
  ).toBeLessThanOrEqual(2);
  await expectNoAccessibilityViolations(screen.container);
});

test("keeps every row the same height when the selection moves", async () => {
  const heights: number[][] = [];
  for (const selectedId of ["1", "2", "3"]) {
    const screen = await render(
      <LinesTable fill rowState={(line) => (line.id === selectedId ? "selected" : undefined)} />,
    );
    heights.push(
      screen
        .getByRole("row")
        .elements()
        .slice(1)
        .map((row) => row.getBoundingClientRect().height),
    );
    await screen.unmount();
  }

  expect(new Set(heights.flat()).size).toBe(1);
});

test("keeps the column headers over a centered empty state when asked to", async () => {
  const screen = await render(
    <div style={{ height: 480, width: 600 }}>
      <LinesTable fill emptyKeepsHeaders items={[]} empty={emptyState} />
    </div>,
  );

  expect(screen.getByRole("columnheader").elements()).toHaveLength(2);
  const cardBox = card(screen.getByRole("table").element()).getBoundingClientRect();
  const headerBox = screen.getByRole("columnheader").first().element().getBoundingClientRect();
  const title = screen.getByText("La venta está vacía").element();
  const blockBox = (title.parentElement as HTMLElement).getBoundingClientRect();
  const bodyTop = headerBox.bottom;
  const above = blockBox.top - bodyTop;
  const below = cardBox.bottom - blockBox.bottom;
  expect(Math.abs(above - below)).toBeLessThanOrEqual(2);
  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the legend at the bottom under a headed empty state", async () => {
  const screen = await render(
    <div style={{ height: 480, width: 600 }}>
      <LinesTable fill emptyKeepsHeaders items={[]} empty={emptyState} legend={legend} />
    </div>,
  );

  const cardBox = card(screen.getByRole("table").element()).getBoundingClientRect();
  const footerBox = (
    screen.getByRole("list").element().parentElement as HTMLElement
  ).getBoundingClientRect();
  expect(cardBox.bottom - footerBox.bottom).toBeLessThanOrEqual(1);
  expect(screen.getByRole("columnheader").elements()).toHaveLength(2);
});

const loadFailure = {
  variant: "centered" as const,
  icon: <TriangleAlert />,
  title: "No se pudo cargar la venta",
  description: "Volvé a intentarlo en unos segundos.",
};

test("keeps the column headers over a centered failure when asked to", async () => {
  const screen = await render(
    <div style={{ height: 480, width: 600 }}>
      <LinesTable fill failureKeepsHeaders items={[]} failure={loadFailure} />
    </div>,
  );

  expect(screen.getByRole("columnheader").elements()).toHaveLength(2);
  const cardBox = card(screen.getByRole("table").element()).getBoundingClientRect();
  const headerBox = screen.getByRole("columnheader").first().element().getBoundingClientRect();
  const title = screen.getByText("No se pudo cargar la venta").element();
  const blockBox = (title.parentElement as HTMLElement).getBoundingClientRect();
  const above = blockBox.top - headerBox.bottom;
  const below = cardBox.bottom - blockBox.bottom;
  expect(Math.abs(above - below)).toBeLessThanOrEqual(2);
  await expectNoAccessibilityViolations(screen.container);
});

test("retries from a failure that keeps the column headers", async () => {
  const onRetry = vi.fn();
  const screen = await render(
    <div style={{ height: 480, width: 600 }}>
      <LinesTable fill failureKeepsHeaders items={[]} failure={{ ...loadFailure, onRetry }} />
    </div>,
  );

  await screen.getByRole("button", { name: "Reintentar" }).click();

  expect(onRetry).toHaveBeenCalledTimes(1);
});

test("still shows only the failure when the headers are not asked for", async () => {
  const screen = await render(
    <div style={{ height: 480, width: 600 }}>
      <LinesTable fill items={[]} failure={loadFailure} />
    </div>,
  );

  expect(screen.getByRole("columnheader").elements()).toHaveLength(0);
});
