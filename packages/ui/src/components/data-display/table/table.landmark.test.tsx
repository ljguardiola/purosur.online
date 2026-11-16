import { useId } from "react";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../test/axe";
import { Table } from "./table";
import { dataColumn } from "./table-columns";
import type { TableColumns, TableSort } from "./table-types";
import { useTableModel } from "./use-table-model";

type Lot = { id: string; name: string; origin: string; cost: string };

const NO_SORT: TableSort = { column: "", direction: "ascending" };

const lots: Lot[] = [
  {
    id: "1",
    name: "Compra 10/11/2026 · 1",
    origin: "Distribuidora del Valle",
    cost: "$ 27.599,00",
  },
];

const columns: TableColumns<Lot> = [
  dataColumn({ id: "name", header: "Lote", render: (lot: Lot) => lot.name }),
  dataColumn({ id: "origin", header: "Origen", render: (lot: Lot) => lot.origin }),
  dataColumn({ id: "cost", header: "Costo unitario", render: (lot: Lot) => lot.cost }),
];

function LotsSection() {
  const headingId = useId();
  const table = useTableModel({
    items: lots,
    id: (lot) => lot.id,
    columns,
    sort: NO_SORT,
    onSortChange: () => {},
  });
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>Lotes</h2>
      <Table table={table} aria-label="Lotes" />
    </section>
  );
}

test("has no accessibility violations when it overflows inside a section named like it", async () => {
  const screen = await render(
    <div style={{ width: "200px" }}>
      <LotsSection />
    </div>,
  );

  const scroller = screen.container.querySelector("[tabindex='0']") as HTMLElement;
  expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth);
  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the sideways scroll of an overflowing table reachable from the keyboard", async () => {
  const screen = await render(
    <div style={{ width: "200px" }}>
      <LotsSection />
    </div>,
  );

  expect(screen.getByRole("group", { name: "Lotes" }).element().getAttribute("tabindex")).toBe("0");
});
