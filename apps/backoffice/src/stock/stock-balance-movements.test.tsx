import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { render } from "../shell/test-support/render-with-router";
import { StockBalanceMovements } from "./stock-balance-movements";
import { createServices } from "./test-support/stock-balances-screen";
import {
  almonds,
  almondsAdjustment,
  almondsCount,
  almondsExpiredLoss,
  honeyCount,
  honeyLoss,
} from "./test-support/stock-fixtures";

const olderAlmondsCount = {
  ...almondsCount,
  id: "count-older",
  occurredAt: "2026-09-01T15:00:00.000Z",
  counted: 11_000,
  delta: -1_000,
};

function withMovements(services = createServices()) {
  vi.mocked(services.fetchStockCounts).mockResolvedValue({
    kind: "ok",
    value: { counts: [olderAlmondsCount, honeyCount, almondsCount] },
  });
  vi.mocked(services.fetchStockMovements).mockResolvedValue({
    kind: "ok",
    value: { movements: [almondsExpiredLoss, honeyLoss, almondsAdjustment] },
  });
  return services;
}

function renderMovements(
  services = createServices(),
  { showsCounts = true, showsMovements = true } = {},
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <StockBalanceMovements
        productId={almonds.id}
        productName={almonds.name}
        services={services}
        showsCounts={showsCounts}
        showsMovements={showsMovements}
        onSessionEnded={() => {}}
      />
    </FieldSizeProvider>,
  );
}

function datesOf(table: ReturnType<Awaited<ReturnType<typeof renderMovements>>["getByRole"]>) {
  return table
    .getByRole("row")
    .elements()
    .map((row) => /\d\d\/\d\d\/\d{4}/.exec(row.textContent)?.[0])
    .filter((date) => date !== undefined);
}

test("names the period it reads, and reads the longest one the lists offer", async () => {
  const services = withMovements();
  const screen = await renderMovements(services);

  await expect.element(screen.getByText("Movimientos de los últimos 90 días")).toBeVisible();
  expect(services.fetchStockCounts).toHaveBeenCalledWith(90);
  expect(services.fetchStockMovements).toHaveBeenCalledWith(90);
});

test("lists the product's counts in the order the cloud answered them, leaving out other products' counts", async () => {
  const screen = await renderMovements(withMovements(), { showsMovements: false });

  const counts = screen.getByRole("table", { name: `Recuentos de ${almonds.name}` });
  await expect.element(counts.getByText("15/09/2026")).toBeVisible();
  expect(datesOf(counts)).toEqual(["01/09/2026", "15/09/2026"]);
  await expectNoAccessibilityViolations(screen.container);
});

test("lists the product's adjustments and losses in the order the cloud answered them with their reason, leaving out other products'", async () => {
  const screen = await renderMovements(withMovements(), { showsCounts: false });

  const movements = screen.getByRole("table", { name: `Ajustes y pérdidas de ${almonds.name}` });
  await expect.element(movements.getByText("Vencimiento")).toBeVisible();
  const reasons = movements
    .getByRole("row")
    .elements()
    .map((row) =>
      ["Corrección de una tanda", "Vencimiento"].find((r) => row.textContent?.includes(r)),
    )
    .filter((reason) => reason !== undefined);
  expect(reasons).toEqual(["Vencimiento", "Corrección de una tanda"]);
  expect(movements.getByText("Rotura o derrame").query()).toBeNull();
});

test("reads only the counts when it shows only the counts", async () => {
  const services = withMovements();
  const screen = await renderMovements(services, { showsMovements: false });

  await expect
    .element(screen.getByRole("table", { name: `Recuentos de ${almonds.name}` }))
    .toBeVisible();
  expect(services.fetchStockMovements).not.toHaveBeenCalled();
});

test("reads only the adjustments and losses when it shows only them", async () => {
  const services = withMovements();
  const screen = await renderMovements(services, { showsCounts: false });

  await expect
    .element(screen.getByRole("table", { name: `Ajustes y pérdidas de ${almonds.name}` }))
    .toBeVisible();
  expect(services.fetchStockCounts).not.toHaveBeenCalled();
});

test("shows nothing and reads nothing when it shows neither list", async () => {
  const services = withMovements();
  const screen = await renderMovements(services, { showsCounts: false, showsMovements: false });

  expect(screen.container.textContent).toBe("");
  expect(services.fetchStockCounts).not.toHaveBeenCalled();
  expect(services.fetchStockMovements).not.toHaveBeenCalled();
});

test("says in each table that the product has no counts or no adjustments and losses in the period read", async () => {
  const screen = await renderMovements();

  await expect
    .element(
      screen
        .getByRole("table", { name: `Recuentos de ${almonds.name}` })
        .getByText("Sin recuentos en los últimos 90 días"),
    )
    .toBeVisible();
  await expect
    .element(
      screen
        .getByRole("table", { name: `Ajustes y pérdidas de ${almonds.name}` })
        .getByText("Sin ajustes ni pérdidas en los últimos 90 días"),
    )
    .toBeVisible();
});

test("offers a retry when the product's counts fail to load", async () => {
  const services = createServices();
  vi.mocked(services.fetchStockCounts)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: { counts: [almondsCount] } });
  const screen = await renderMovements(services, { showsMovements: false });

  await screen.getByRole("button", { name: "Reintentar" }).click();

  await expect
    .element(
      screen.getByRole("table", { name: `Recuentos de ${almonds.name}` }).getByText("15/09/2026"),
    )
    .toBeVisible();
});
