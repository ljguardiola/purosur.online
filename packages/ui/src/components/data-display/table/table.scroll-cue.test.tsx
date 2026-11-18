import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { Table } from "./table";
import { dataColumn } from "./table-columns";
import type { TableColumns, TableSort } from "./table-types";
import { useTableModel } from "./use-table-model";

type Lot = { id: string; name: string; origin: string; remaining: string; cost: string };

const NO_SORT: TableSort = { column: "", direction: "ascending" };

const lots: Lot[] = [
  {
    id: "1",
    name: "Compra 10/11/2026 · 1",
    origin: "Distribuidora del Valle",
    remaining: "2,000 kg",
    cost: "$ 27.599,00 / kg",
  },
];

const columns: TableColumns<Lot> = [
  dataColumn({ id: "name", header: "Lote", render: (lot: Lot) => lot.name }),
  dataColumn({ id: "origin", header: "Origen", render: (lot: Lot) => lot.origin }),
  dataColumn({ id: "remaining", header: "Saldo", render: (lot: Lot) => lot.remaining }),
  dataColumn({ id: "cost", header: "Costo unitario", render: (lot: Lot) => lot.cost }),
];

function LotsTable() {
  const table = useTableModel({
    items: lots,
    id: (lot) => lot.id,
    columns,
    sort: NO_SORT,
    onSortChange: () => {},
  });
  return <Table table={table} aria-label="Lotes" />;
}

async function renderIn(width: number) {
  const screen = await render(
    <div style={{ width: `${width}px` }}>
      <LotsTable />
    </div>,
  );
  const region = () => screen.container.querySelector("[tabindex='0']") as HTMLElement | null;
  const cue = (edge: "start" | "end") =>
    screen.container.querySelector(`[data-scroll-cue='${edge}']`) as HTMLElement | null;
  return { region, cue };
}

test("marks the right edge of a table that continues beyond it, and nothing on its left", async () => {
  const { region, cue } = await renderIn(200);

  await expect.poll(() => cue("end")).not.toBeNull();
  expect(cue("start")).toBeNull();
  const regionBox = (region() as HTMLElement).getBoundingClientRect();
  const cueBox = (cue("end") as HTMLElement).getBoundingClientRect();
  expect(cueBox.right).toBeCloseTo(regionBox.right, 0);
  expect(cueBox.width).toBeGreaterThan(0);
  expect(cueBox.top).toBeCloseTo(regionBox.top, 0);
  expect(cueBox.bottom).toBeCloseTo(regionBox.bottom, 0);
});

test("marks the left edge instead once scrolled to the end", async () => {
  const { region, cue } = await renderIn(200);
  await expect.poll(() => cue("end")).not.toBeNull();

  const scrolled = region() as HTMLElement;
  scrolled.scrollLeft = scrolled.scrollWidth;

  await expect.poll(() => cue("start")).not.toBeNull();
  expect(cue("end")).toBeNull();
  const cueBox = (cue("start") as HTMLElement).getBoundingClientRect();
  expect(cueBox.left).toBeCloseTo(scrolled.getBoundingClientRect().left, 0);
});

test("marks both edges while scrolled between them", async () => {
  const { region, cue } = await renderIn(200);
  await expect.poll(() => cue("end")).not.toBeNull();

  const scrolled = region() as HTMLElement;
  scrolled.scrollLeft = 20;

  await expect.poll(() => cue("start")).not.toBeNull();
  expect(cue("end")).not.toBeNull();
});

test("marks no edge of a table that fits", async () => {
  const { cue } = await renderIn(1000);

  expect(cue("start")).toBeNull();
  expect(cue("end")).toBeNull();
});

test("lets a press reach the cells under a mark", async () => {
  const { cue } = await renderIn(200);
  await expect.poll(() => cue("end")).not.toBeNull();

  expect(getComputedStyle(cue("end") as HTMLElement).pointerEvents).toBe("none");
});
