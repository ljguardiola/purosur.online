import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { readDownloadedXlsx } from "../platform/spreadsheet/test-support/read-xlsx";
import { periodSegments, typePeriodStart } from "../shell/test-support/report-dates";
import { spyOnDownloads } from "../shell/test-support/spy-on-downloads";
import { stockMovementsSearch } from "./routes";
import {
  ADJUSTMENTS_ONLY,
  createServices,
  EVERYTHING,
  renderScreen,
} from "./test-support/stock-movements-screen";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

const ONLY_LOSSES = stockMovementsSearch.parse({ type: ["loss"] });

const GROUPING = { role: "switch", name: "Agrupar por motivo" } as const;

test("offers to group by reason when only losses are listed and the session may see their report", async () => {
  const screen = await renderScreen(createServices(), { filters: ONLY_LOSSES });

  await expect.element(screen.getByRole(GROUPING.role, { name: GROUPING.name })).toBeVisible();
});

test.each([
  ["no type is chosen", stockMovementsSearch.parse({}), EVERYTHING],
  [
    "adjustments are listed too",
    stockMovementsSearch.parse({ type: ["loss", "adjustment"] }),
    EVERYTHING,
  ],
  ["only adjustments are listed", stockMovementsSearch.parse({ type: ["adjustment"] }), EVERYTHING],
  ["the session may not see the losses report", ONLY_LOSSES, ADJUSTMENTS_ONLY],
])("offers no grouping when %s", async (_case, filters, access) => {
  const screen = await renderScreen(createServices(), { filters, access });
  await expect.element(screen.getByRole("table", { name: "Movimientos" })).toBeVisible();

  expect(screen.getByRole(GROUPING.role, { name: GROUPING.name }).query()).toBeNull();
});

test("reports the grouping asked for", async () => {
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(createServices(), { filters: ONLY_LOSSES, onFiltersChange });

  await userEvent.click(screen.getByText(GROUPING.name));

  await expect.poll(() => onFiltersChange.mock.lastCall?.[0]).toMatchObject({ view: "reason" });
});

test("shows the losses of each reason with the range instead of the list when grouped", async () => {
  const services = createServices();
  const screen = await renderScreen(services, {
    filters: stockMovementsSearch.parse({ type: ["loss"], view: "reason" }),
  });

  await expect.element(screen.getByRole("region", { name: "Mal estado" })).toBeVisible();
  await expect.element(screen.getByRole("region", { name: "Vencimiento" })).toBeVisible();
  expect(screen.getByRole("table", { name: "Movimientos" }).query()).toBeNull();
  expect(screen.getByRole("button", { name: /Período:/ }).query()).toBeNull();
  await expect.poll(() => periodSegments(screen).slice(0, 3)).toEqual(["1", "10", "2026"]);
  expect(services.fetchLossesByReasonReport).toHaveBeenCalledWith({});
  expect(services.fetchStockMovements).not.toHaveBeenCalled();
});

test("asks the report for the range the URL names and reports a typed one", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(services, {
    filters: stockMovementsSearch.parse({
      type: ["loss"],
      view: "reason",
      from: "2026-12-01",
      to: "2026-12-31",
    }),
    onFiltersChange,
  });
  await expect
    .poll(() => services.fetchLossesByReasonReport)
    .toHaveBeenCalledWith({
      from: "2026-12-01",
      to: "2026-12-31",
    });

  await typePeriodStart(screen, "10112026");

  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toMatchObject({ from: "2026-11-10", to: "2026-12-31" });
});

test("downloads the grouped losses as a spreadsheet", async () => {
  const downloads = spyOnDownloads();
  const screen = await renderScreen(createServices(), {
    filters: stockMovementsSearch.parse({ type: ["loss"], view: "reason" }),
  });
  await expect.element(screen.getByRole("region", { name: "Mal estado" })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Descargar planilla" }));

  await expect
    .poll(() => downloads.names)
    .toEqual(["mermas-por-motivo-2026-10-01-2026-10-31.xlsx"]);
  const file = await readDownloadedXlsx(downloads.blobs[0]);
  expect(file.sheetNames).toEqual(["Resumen", "Mal estado", "Vencimiento"]);
});

test("lists the losses again when the type no longer is only losses", async () => {
  const screen = await renderScreen(createServices(), {
    access: EVERYTHING,
    filters: stockMovementsSearch.parse({ type: ["count"], view: "reason" }),
  });

  await expect.element(screen.getByRole("table", { name: "Movimientos" })).toBeVisible();
  expect(screen.getByRole("region", { name: "Mal estado" }).query()).toBeNull();
});
