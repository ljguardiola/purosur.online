import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { accessWith } from "../shell/test-support/backoffice-access";
import { listed, type RenderOptions, renderScreen } from "./test-support/stock-balances-screen";
import {
  almonds,
  almondsAdjustment,
  almondsCount,
  almondsExpiredLoss,
  honey,
  honeyCount,
  honeyLoss,
  oats,
  tea,
} from "./test-support/stock-fixtures";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

const COUNTER = accessWith("stock_area", "stock_balances", "stock_counts");
const ADJUSTER = accessWith("stock_area", "stock_balances", "stock_movements");

const olderAlmondsCount = {
  ...almondsCount,
  id: "count-older",
  occurredAt: "2026-09-01T15:00:00.000Z",
  counted: 11_000,
  delta: -1_000,
};

function rowOf(screen: Awaited<ReturnType<typeof renderScreen>>, name: string) {
  return screen.getByRole("row").filter({ hasText: name });
}

async function renderWithPanel(options: RenderOptions = {}, services = listed()) {
  const screen = await renderScreen(services, options);
  return { screen, services };
}

function withMovements(services = listed()) {
  vi.mocked(services.fetchStockCounts).mockResolvedValue({
    kind: "ok",
    value: { counts: [honeyCount, almondsCount, olderAlmondsCount] },
  });
  vi.mocked(services.fetchStockMovements).mockResolvedValue({
    kind: "ok",
    value: { movements: [honeyLoss, almondsExpiredLoss, almondsAdjustment] },
  });
  return services;
}

test("opens the panel of the product named beside the list, and marks its row", async () => {
  const { screen } = await renderWithPanel({ openProduct: honey.id });

  await expect.element(screen.getByRole("complementary", { name: honey.name })).toBeVisible();
  await expect.element(rowOf(screen, honey.name)).toHaveAttribute("aria-current", "true");
  expect(rowOf(screen, almonds.name).element()).not.toHaveAttribute("aria-current");
  await expect.element(screen.getByRole("table", { name: "Saldos" })).toBeVisible();
});

test("shows no panel when no product is named", async () => {
  const { screen } = await renderWithPanel();

  await expect.element(screen.getByText(honey.name)).toBeVisible();
  expect(screen.getByRole("complementary").query()).toBeNull();
});

test("does not open a panel for a product the list does not show, and asks to close it", async () => {
  const onOpenProductChange = vi.fn();

  const { screen } = await renderWithPanel({ openProduct: oats.id, onOpenProductChange });

  await expect.element(screen.getByText(honey.name)).toBeVisible();
  expect(screen.getByRole("complementary").query()).toBeNull();
  await vi.waitFor(() => expect(onOpenProductChange).toHaveBeenCalledExactlyOnceWith(undefined));
});

test("pressing a row asks to open the panel of its product", async () => {
  const onOpenProductChange = vi.fn();
  const { screen } = await renderWithPanel({ onOpenProductChange });

  await userEvent.click(screen.getByText(almonds.name));

  expect(onOpenProductChange).toHaveBeenCalledExactlyOnceWith(almonds.id);
});

test("closing the panel asks to close it", async () => {
  const onOpenProductChange = vi.fn();
  const { screen } = await renderWithPanel({ openProduct: honey.id, onOpenProductChange });

  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

  expect(onOpenProductChange).toHaveBeenCalledExactlyOnceWith(undefined);
});

test("offers no button to open the lots under a row", async () => {
  const { screen } = await renderWithPanel();

  await expect.element(screen.getByText(honey.name)).toBeVisible();
  expect(screen.getByRole("button", { name: /Ver los lotes de/ }).query()).toBeNull();
});

test("shows the product's balance, cost, value and lots in the panel", async () => {
  const { screen } = await renderWithPanel({ openProduct: almonds.id });

  const panel = screen.getByRole("complementary", { name: almonds.name });
  await expect.element(panel.getByText("12,150 kg")).toBeVisible();
  await expect.element(panel.getByText("$ 10.205,84 / kg")).toBeVisible();
  await expect.element(panel.getByText("$ 124.001,00")).toBeVisible();
  await expect
    .element(panel.getByRole("table", { name: `Lotes de ${almonds.name}` }))
    .toBeVisible();
  await expect.element(panel.getByText("Compra 12/09/2026")).toBeVisible();
});

test("shows no lots table for a product without lots", async () => {
  const { screen } = await renderWithPanel({ openProduct: tea.id });

  const panel = screen.getByRole("complementary", { name: tea.name });
  await expect.element(panel).toBeVisible();
  expect(panel.getByRole("table").query()).toBeNull();
});

test("lists the product's counts newest first, leaving out other products' counts", async () => {
  const { screen, services } = await renderWithPanel(
    { openProduct: almonds.id, access: COUNTER },
    withMovements(),
  );

  const counts = screen.getByRole("table", { name: `Recuentos de ${almonds.name}` });
  await expect.element(counts).toBeVisible();
  const dates = counts
    .getByRole("row")
    .elements()
    .map((row) => /\d\d\/\d\d\/\d{4}/.exec(row.textContent)?.[0])
    .filter((date) => date !== undefined);
  expect(dates).toEqual(["15/09/2026", "01/09/2026"]);
  expect(services.fetchStockMovements).not.toHaveBeenCalled();
});

test("lists the product's adjustments and losses newest first with their reason, leaving out other products'", async () => {
  const { screen, services } = await renderWithPanel(
    { openProduct: almonds.id, access: ADJUSTER },
    withMovements(),
  );

  const movements = screen.getByRole("table", { name: `Ajustes y pérdidas de ${almonds.name}` });
  await expect.element(movements).toBeVisible();
  const reasons = movements
    .getByRole("row")
    .elements()
    .map((row) =>
      ["Corrección de una tanda", "Vencimiento"].find((r) => row.textContent?.includes(r)),
    )
    .filter((reason) => reason !== undefined);
  expect(reasons).toEqual(["Corrección de una tanda", "Vencimiento"]);
  expect(movements.getByText("Rotura o derrame").query()).toBeNull();
  expect(services.fetchStockCounts).not.toHaveBeenCalled();
});

test("shows both lists for a person who can count and move stock", async () => {
  const { screen } = await renderWithPanel(
    {
      openProduct: almonds.id,
      access: accessWith("stock_balances", "stock_counts", "stock_movements"),
    },
    withMovements(),
  );

  await expect
    .element(screen.getByRole("table", { name: `Recuentos de ${almonds.name}` }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("table", { name: `Ajustes y pérdidas de ${almonds.name}` }))
    .toBeVisible();
});

test("shows no movements and reads none for a person who can neither count nor move stock", async () => {
  const { screen, services } = await renderWithPanel({ openProduct: almonds.id }, withMovements());

  await expect
    .element(screen.getByRole("table", { name: `Lotes de ${almonds.name}` }))
    .toBeVisible();
  expect(screen.getByText("Movimientos").query()).toBeNull();
  expect(services.fetchStockCounts).not.toHaveBeenCalled();
  expect(services.fetchStockMovements).not.toHaveBeenCalled();
});

test("says the product has no counts or no adjustments and losses yet", async () => {
  const services = listed();
  const { screen } = await renderWithPanel(
    {
      openProduct: tea.id,
      access: accessWith("stock_balances", "stock_counts", "stock_movements"),
    },
    services,
  );

  await expect.element(screen.getByText("Sin recuentos de este producto")).toBeVisible();
  await expect.element(screen.getByText("Sin ajustes ni pérdidas de este producto")).toBeVisible();
});

test("offers a retry when the product's movements fail to load", async () => {
  const services = listed();
  vi.mocked(services.fetchStockCounts)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: { counts: [almondsCount] } });
  const { screen } = await renderWithPanel({ openProduct: almonds.id, access: COUNTER }, services);

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByRole("table", { name: `Recuentos de ${almonds.name}` }))
    .toBeVisible();
});
