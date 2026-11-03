import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { StockBalanceLots } from "./stock-balance-lots";
import { almonds, crackers, honey } from "./test-support/stock-fixtures";

function renderLots(product: typeof almonds) {
  return render(
    <FieldSizeProvider size="backoffice">
      <StockBalanceLots product={product} />
    </FieldSizeProvider>,
  );
}

test("lists the lots in the order the cloud answered them, with their supplier, balance, cost and value", async () => {
  const screen = await renderLots(almonds);

  const lots = screen.getByRole("table", { name: `Lotes de ${almonds.name}` });
  const rows = lots.getByRole("row").elements();
  expect(rows.map((row) => row.textContent)).toEqual([
    "LoteVencimientoOrigenSaldoCosto unitarioValorizado",
    "Compra 05/08/202614/10/2026Distribuidora del Sur4,300 kg$ 10.180,00 / kg$ 43.774,00",
    "Compra 12/09/202628/02/2027Distribuidora del Sur7,850 kg$ 10.220,00 / kg$ 80.227,00",
  ]);
  await expectNoAccessibilityViolations(screen.container);
});

test("tells that the lot consumed first is the one that expires first when there are several", async () => {
  const screen = await renderLots(almonds);

  await expect
    .element(screen.getByText("Lotes · se consume primero el que vence antes"))
    .toBeVisible();
});

test("titles a single lot just Lotes", async () => {
  const screen = await renderLots(honey);

  await expect.element(screen.getByText("Lotes", { exact: true })).toBeVisible();
  expect(screen.getByText("Lotes · se consume primero el que vence antes").query()).toBeNull();
});

test("shows a lot with no expiry as a dash, with a unit's cost unlabeled", async () => {
  const screen = await renderLots(honey);

  const lot = screen.getByRole("table", { name: `Lotes de ${honey.name}` });
  expect(lot.getByRole("row").nth(1).element().textContent).toBe(
    "Compra 20/09/2026—Apícola Los Álamos24 u$ 5.440,00$ 130.560,00",
  );
});

test("shows a technical lot by its name, from the product's sales without lots and with no cost", async () => {
  const screen = await renderLots(crackers);

  const lot = screen.getByRole("table", { name: `Lotes de ${crackers.name}` });
  expect(lot.getByRole("row").nth(1).element().textContent).toBe(
    "Técnico 07/10/2026—Ventas sin lotes del producto− 4 uSin costo—",
  );
});

test("shows a lot of the initial count by its name, costed and valued like a purchase lot", async () => {
  const counted = {
    ...honey,
    lots: [
      {
        id: "lot-initial",
        lotName: "Inventario inicial 27/10/2026",
        expiresOn: null,
        remaining: 24_000,
        valueCents: 13_056_000,
        unitCostCents: 544_000,
        origin: { kind: "initial_count" as const },
      },
    ],
  };
  const screen = await renderLots(counted);

  const lot = screen.getByRole("table", { name: "Lotes de Miel pura de abeja 1 kg" });
  expect(lot.getByRole("row").nth(1).element().textContent).toBe(
    "Inventario inicial 27/10/2026——24 u$ 5.440,00$ 130.560,00",
  );
});

test("shows an initial count lot with no cost as Sin costo", async () => {
  const counted = {
    ...honey,
    lots: [
      {
        id: "lot-initial",
        lotName: "Inventario inicial 27/10/2026",
        expiresOn: null,
        remaining: 24_000,
        valueCents: null,
        unitCostCents: null,
        origin: { kind: "initial_count" as const },
      },
    ],
  };
  const screen = await renderLots(counted);

  const lot = screen.getByRole("table", { name: "Lotes de Miel pura de abeja 1 kg" });
  expect(lot.getByRole("row").nth(1).element().textContent).toBe(
    "Inventario inicial 27/10/2026——24 uSin costo—",
  );
});

test("shows a lot of an assembled batch by its name, with no origin beside it", async () => {
  const assembled = {
    ...honey,
    lots: [
      {
        id: "lot-batch",
        lotName: "Tanda 15/09/2026",
        expiresOn: "2026-11-02",
        remaining: 4_950,
        valueCents: 4_906_440,
        unitCostCents: 991_200,
        origin: { kind: "assembly_batch" as const, assembledAt: "2026-09-15T13:30:00.000Z" },
      },
    ],
  };
  const screen = await renderLots(assembled);

  const lot = screen.getByRole("table", { name: "Lotes de Miel pura de abeja 1 kg" });
  const row = lot.getByRole("row").nth(1);
  expect(row.getByRole("cell").nth(0).element().textContent).toBe("Tanda 15/09/2026");
  expect(row.getByRole("cell").nth(2).element().textContent).toBe("—");
});

test("shows a lot's system name, never the number typed when it was recorded", async () => {
  const screen = await renderLots(almonds);

  await expect.element(screen.getByText("Compra 05/08/2026")).toBeVisible();
  expect(screen.container.textContent).not.toContain("L-2312");
});
