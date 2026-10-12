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

test("lists the lots in the order the cloud answered them, with their origin, balance, cost and value", async () => {
  const screen = await renderLots(almonds);

  const lots = screen.getByRole("table", { name: `Lotes de ${almonds.name}` });
  const rows = lots.getByRole("row").elements();
  expect(rows.map((row) => row.textContent)).toEqual([
    "LoteVencimientoOrigenSaldoCosto unitarioValorizado",
    "L-231214/10/2026Compra del 05/08/2026 · Distribuidora del Sur4,300 kg$ 10.180,00 / kg$ 43.774,00",
    "L-240928/02/2027Compra del 12/09/2026 · Distribuidora del Sur7,850 kg$ 10.220,00 / kg$ 80.227,00",
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

test("shows a lot with no number and no expiry as a dash, with a unit's cost unlabeled", async () => {
  const screen = await renderLots(honey);

  const lot = screen.getByRole("table", { name: `Lotes de ${honey.name}` });
  expect(lot.getByRole("row").nth(1).element().textContent).toBe(
    "——Compra del 20/09/2026 · Apícola Los Álamos24 u$ 5.440,00$ 130.560,00",
  );
});

test("shows a technical lot as Técnico, from the product's sales without lots and with no cost", async () => {
  const screen = await renderLots(crackers);

  const lot = screen.getByRole("table", { name: `Lotes de ${crackers.name}` });
  expect(lot.getByRole("row").nth(1).element().textContent).toBe(
    "Técnico—Ventas sin lotes del producto− 4 uSin costo—",
  );
});

test("shows a lot of the initial count as Inventario inicial, costed and valued like a purchase lot", async () => {
  const counted = {
    ...honey,
    lots: [
      {
        id: "lot-initial",
        lotNumber: null,
        expiresOn: null,
        technical: false,
        remaining: 24_000,
        valueCents: 13_056_000,
        unitCostCents: 544_000,
        origin: { kind: "initial_count" as const },
      },
    ],
  };
  const screen = await renderLots(counted);

  const lot = screen.getByRole("table", { name: `Lotes de ` });
  expect(lot.getByRole("row").nth(1).element().textContent).toBe(
    "——Inventario inicial24 u$ 5.440,00$ 130.560,00",
  );
});

test("shows an initial count lot with no cost as Sin costo", async () => {
  const counted = {
    ...honey,
    lots: [
      {
        id: "lot-initial",
        lotNumber: null,
        expiresOn: null,
        technical: false,
        remaining: 24_000,
        valueCents: null,
        unitCostCents: null,
        origin: { kind: "initial_count" as const },
      },
    ],
  };
  const screen = await renderLots(counted);

  const lot = screen.getByRole("table", { name: `Lotes de ` });
  expect(lot.getByRole("row").nth(1).element().textContent).toBe(
    "——Inventario inicial24 uSin costo—",
  );
});
