import { CircleAlert, Package } from "lucide-react";
import type { ReactNode } from "react";
import { expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../test/axe";
import { Table } from "./table";
import { dataColumn } from "./table-columns";
import type { TableColumns, TableVariant } from "./table-types";
import { useTableModel } from "./use-table-model";

type Lot = { id: string; name: string; origin: string; remaining: string; cost: string };

const lots: Lot[] = [
  {
    id: "1",
    name: "Compra 10/11/2026 · 1",
    origin: "Distribuidora del Valle",
    remaining: "2,000 kg",
    cost: "$ 27.599,00 / kg",
  },
];

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
}: {
  columns: TableColumns<Lot>;
  variant: TableVariant;
  items?: Lot[];
  failed?: boolean;
}) {
  const table = useTableModel({ items, id: (lot) => lot.id, columns });
  return failed ? (
    <Table
      table={table}
      aria-label="Lotes"
      variant={variant}
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
      variant={variant}
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
    const region = screen.getByRole("region", { name: "Lotes" }).element() as HTMLElement;
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
  const region = screen.getByRole("region", { name: "Lotes" }).element() as HTMLElement;

  await userEvent.tab();

  expect(document.activeElement).toBe(region);
});

test("keeps a column with no width readable, never narrower than 96px of content, when the declared widths already fill the container", async () => {
  const screen = await render(inside(320, <LotsTable columns={wideColumns} variant="nested" />));
  const origin = screen.getByRole("columnheader", { name: "Origen" }).element() as HTMLElement;

  expect(origin.getBoundingClientRect().width).toBeGreaterThanOrEqual(96 + 6 + 6);
});

test("adds no scrolling region when the columns fit their container", async () => {
  const screen = await render(inside(320, <LotsTable columns={narrowColumns} variant="nested" />));

  expect(screen.getByRole("region").query()).toBeNull();
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
      inside(320, <LotsTable columns={wideColumns} variant="nested" items={[]} failed={failed} />),
    );
    const title = screen.getByText(message).first().element();
    const container = screen.container.firstElementChild as HTMLElement;
    const origin = screen.getByRole("columnheader", { name: "Origen" }).element();

    expect(title.getBoundingClientRect().left).toBeGreaterThanOrEqual(
      container.getBoundingClientRect().left,
    );
    expect(title.getBoundingClientRect().right).toBeLessThanOrEqual(
      container.getBoundingClientRect().right,
    );
    expect(origin.getBoundingClientRect().width).toBeGreaterThanOrEqual(96 + 6 + 6);
    await expectNoAccessibilityViolations(screen.container);
  },
);
