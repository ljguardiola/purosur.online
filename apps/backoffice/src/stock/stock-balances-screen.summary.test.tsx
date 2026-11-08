import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { readDownloadedXlsx } from "../platform/spreadsheet/test-support/read-xlsx";
import { spyOnDownloads } from "../shell/test-support/spy-on-downloads";
import { stockBalancesFilters } from "./routes";
import { createServices, listed, renderScreen } from "./test-support/stock-balances-screen";
import { almonds, crackers, honey, tea } from "./test-support/stock-fixtures";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

const SUMMARY = { productCount: 7, valueCents: 38_336_900, withoutCostCount: 3 };

test("shows the total stock value above the list, with how many products it covers and how many have no cost", async () => {
  const screen = await renderScreen(listed([almonds], SUMMARY));

  await expect.element(screen.getByText("Valorizado a costo")).toBeVisible();
  await expect.element(screen.getByText("$ 383.369,00")).toBeVisible();
  await expect.element(screen.getByText("7 productos con movimiento · 3 sin costo")).toBeVisible();
  const total = screen.getByText("$ 383.369,00").element();
  const table = screen.getByRole("table", { name: "Saldos" }).element();
  expect(total.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test("writes how many products the total covers as the total's detail, above it", async () => {
  const screen = await renderScreen(listed([almonds], SUMMARY));

  const coverage = screen.getByText("7 productos con movimiento · 3 sin costo");
  await expect.element(coverage).toBeVisible();
  const total = screen.getByText("$ 383.369,00").element();
  expect(
    coverage.element().compareDocumentPosition(total) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(coverage.element().parentElement).toBe(total.parentElement);
});

test("leaves out the count of products without cost when there is none, and writes a single product in singular", async () => {
  const screen = await renderScreen(
    listed([almonds], { productCount: 1, valueCents: 12_400_100, withoutCostCount: 0 }),
  );

  await expect.element(screen.getByText("1 producto con movimiento")).toBeVisible();
  expect(screen.getByText(/sin costo/).query()).toBeNull();
});

test("writes the counts with the thousands separator", async () => {
  const screen = await renderScreen(
    listed([almonds], { productCount: 1998, valueCents: 12_400_100, withoutCostCount: 1500 }),
  );

  await expect
    .element(screen.getByText("1.998 productos con movimiento · 1.500 sin costo"))
    .toBeVisible();
});

test("shows no total when the balances fail to load", async () => {
  const services = createServices();
  vi.mocked(services.fetchStockBalances).mockResolvedValue({ kind: "failed" });
  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
  expect(screen.getByText("Valorizado a costo").query()).toBeNull();
});

test("downloads a spreadsheet of the products shown, in the order the screen sorts them, with their lots", async () => {
  const downloads = spyOnDownloads();
  const screen = await renderScreen(listed([honey, almonds, crackers, tea], SUMMARY), {
    filters: stockBalancesFilters.parse({ sortBy: "product", sort: "ascending" }),
  });
  await expect.element(screen.getByText(honey.name)).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Descargar planilla" }));

  await expect.poll(() => downloads.names).toEqual(["stock-valorizado.xlsx"]);
  const file = await readDownloadedXlsx(downloads.blobs[0]);
  expect(file.sheetNames).toEqual(["Resumen", "Saldos", "Lotes"]);
  expect(file.sheet(0).get("B2")?.value).toBe("383369");
  expect(file.sheet(0).get("B3")?.value).toBe("7");
  const balances = file.sheet(1);
  expect(balances.get("A2")?.value).toBe(almonds.name);
  expect(balances.get("A3")?.value).toBe(crackers.name);
  expect(balances.get("A4")?.value).toBe(honey.name);
  expect(balances.get("A5")?.value).toBe(tea.name);
  expect(file.sheet(2).get("C2")?.value).toBe("Compra 05/08/2026");
});

test("downloads only the products the filters leave", async () => {
  const downloads = spyOnDownloads();
  const screen = await renderScreen(listed([almonds, honey, crackers, tea]), {
    filters: stockBalancesFilters.parse({ balance: "negative" }),
  });
  await expect.element(screen.getByText(crackers.name)).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Descargar planilla" }));

  await expect.poll(() => downloads.blobs.length).toBe(1);
  const balances = (await readDownloadedXlsx(downloads.blobs[0])).sheet(1);
  expect(balances.get("A2")?.value).toBe(crackers.name);
  expect(balances.get("A3")).toBeUndefined();
});

test("has its download disabled while the balances load and after loading fails", async () => {
  const loading = createServices();
  vi.mocked(loading.fetchStockBalances).mockReturnValue(new Promise(() => {}));
  const failing = createServices();
  vi.mocked(failing.fetchStockBalances).mockResolvedValue({ kind: "failed" });

  const loadingScreen = await renderScreen(loading);
  await expect
    .element(loadingScreen.getByRole("button", { name: "Descargar planilla" }))
    .toBeDisabled();
  await loadingScreen.unmount();

  const failedScreen = await renderScreen(failing);
  await expect.element(failedScreen.getByRole("button", { name: "Reintentar" })).toBeVisible();
  await expect
    .element(failedScreen.getByRole("button", { name: "Descargar planilla" }))
    .toBeDisabled();
});
