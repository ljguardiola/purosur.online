import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { stockMovementsSearch } from "./routes";
import {
  ADJUSTMENTS_ONLY,
  COUNTS_ONLY,
  createServices,
  EVERYTHING,
  LOSSES_ONLY,
  renderScreen,
  TABLE,
} from "./test-support/stock-movements-screen";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

function offeredTypes(screen: Awaited<ReturnType<typeof renderScreen>>) {
  return screen
    .getByRole("toolbar", { name: "Tipo" })
    .getByRole("button")
    .elements()
    .map((chip) => chip.textContent);
}

test.each([
  [EVERYTHING, ["Recuento", "Ajuste", "Pérdida"]],
  [COUNTS_ONLY, ["Recuento"]],
  [LOSSES_ONLY, ["Pérdida"]],
  [ADJUSTMENTS_ONLY, ["Ajuste"]],
])("offers only the types the session allows: %#", async (access, types) => {
  const screen = await renderScreen(createServices(), { access });

  await expect.element(screen.getByRole("toolbar", { name: "Tipo" })).toBeVisible();
  expect(offeredTypes(screen)).toEqual(types);
});

test("lists only the types the URL names", async () => {
  const screen = await renderScreen(createServices(), {
    filters: stockMovementsSearch.parse({ type: ["loss"] }),
  });

  const table = screen.getByRole("table", { name: TABLE });
  await expect.element(table.getByText("Miel pura de abeja 1 kg")).toBeVisible();
  expect(table.getByText("Almendras peladas").query()).toBeNull();
});

test("reports the types chosen and lists them together", async () => {
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(createServices(), { onFiltersChange });
  const table = screen.getByRole("table", { name: TABLE });
  await expect.element(table.getByText("Miel pura de abeja 1 kg")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Recuento" }));
  await userEvent.click(screen.getByRole("button", { name: "Ajuste" }));

  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toMatchObject({ type: ["count", "adjustment"] });
  expect(table.getByText("Miel pura de abeja 1 kg").query()).toBeNull();
  await expect.element(table.getByText("Esperado 12,400 kg · contado 12,150 kg")).toBeVisible();
});

test("ignores a type of the URL the session does not offer", async () => {
  const screen = await renderScreen(createServices(), {
    access: LOSSES_ONLY,
    filters: stockMovementsSearch.parse({ type: ["count"] }),
  });

  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();
});

test("filters by the reason the URL names, which leaves out the counts", async () => {
  const screen = await renderScreen(createServices(), {
    filters: stockMovementsSearch.parse({ reason: "batch_correction" }),
  });

  const table = screen.getByRole("table", { name: TABLE });
  await expect.element(table.getByText("Corrección de una producción")).toBeVisible();
  expect(table.getByText("Miel pura de abeja 1 kg").query()).toBeNull();
  expect(table.getByText("Recuento", { exact: true }).query()).toBeNull();
});

test("offers only the reasons of the kinds the session allows", async () => {
  const screen = await renderScreen(createServices(), { access: LOSSES_ONLY });
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Motivo:/ }));

  const options = screen
    .getByRole("option")
    .elements()
    .map((option) => option.textContent);
  expect(options).toEqual([
    "Todos",
    "Rotura o derrame",
    "Mal estado",
    "Merma de fraccionamiento",
    "Degustación o muestra",
    "Consumo del local",
    "Robo",
  ]);
});

test("offers no reason to a person who may only count", async () => {
  const screen = await renderScreen(createServices(), { access: COUNTS_ONLY });
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();

  expect(screen.getByRole("button", { name: /Motivo:/ }).query()).toBeNull();
});

test.each([
  ["count", EVERYTHING],
  ["theft", ADJUSTMENTS_ONLY],
])("falls back to every reason for the reason %s it does not offer", async (reason, access) => {
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(createServices(), {
    access,
    filters: stockMovementsSearch.parse({ reason }),
    onFiltersChange,
  });

  await expect.element(screen.getByText("Almendras peladas").first()).toBeVisible();
  await expect.poll(() => onFiltersChange.mock.lastCall?.[0]).toMatchObject({ reason: "ALL" });
});

test("reports a new period and reads it", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(services, { onFiltersChange });

  await userEvent.click(screen.getByRole("button", { name: /Período:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Últimos 90 días" }));

  await expect.poll(() => onFiltersChange.mock.lastCall?.[0]).toMatchObject({ period: "90" });
  await expect.poll(() => services.fetchStockMovements).toHaveBeenCalledWith(90);
});
