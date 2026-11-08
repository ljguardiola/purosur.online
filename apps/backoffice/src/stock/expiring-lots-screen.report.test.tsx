import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { readDownloadedXlsx } from "../platform/spreadsheet/test-support/read-xlsx";
import { periodSegments, typePeriodStart } from "../shell/test-support/report-dates";
import { spyOnDownloads } from "../shell/test-support/spy-on-downloads";
import { expiringLotsFilters } from "./routes";
import {
  breadLot,
  cheeseLot,
  expiredYogurtLot,
  expiringLotsReport,
} from "./test-support/expiring-lots-report-fixtures";
import { listed, renderScreen } from "./test-support/expiring-lots-screen";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

const PERIOD = { from: "2026-10-01", to: "2026-10-31" };
const TABLE = { name: "Vencimientos" } as const;

function withReport(report = expiringLotsReport([expiredYogurtLot, cheeseLot])) {
  const services = listed();
  vi.mocked(services.fetchExpiringLotsReport).mockResolvedValue({ kind: "ok", value: report });
  return services;
}

test("shows the period the cloud answered while the URL names none, and keeps listing every expired and upcoming lot", async () => {
  const services = withReport(expiringLotsReport([cheeseLot]));

  const screen = await renderScreen(services);

  await expect.poll(() => periodSegments(screen).slice(0, 3)).toEqual(["13", "10", "2026"]);
  expect(periodSegments(screen).slice(3)).toEqual(["12", "11", "2026"]);
  expect(services.fetchExpiringLotsReport).toHaveBeenCalledWith({});
  await expect.element(screen.getByText("Semillas de chía")).toBeVisible();
  expect(screen.getByText("Queso cremoso").query()).toBeNull();
});

test("lists the lots the report answers for the period the URL carries", async () => {
  const services = withReport();

  const screen = await renderScreen(services, {
    filters: expiringLotsFilters.parse(PERIOD),
  });

  await expect.element(screen.getByRole("table", TABLE).getByText("Queso cremoso")).toBeVisible();
  await expect.element(screen.getByRole("table", TABLE).getByText("Yogur natural")).toBeVisible();
  expect(screen.getByText("Semillas de chía").query()).toBeNull();
  expect(services.fetchExpiringLotsReport).toHaveBeenCalledWith(PERIOD);
});

test("writes off an expired lot of the period as a loss, as it does from the default list", async () => {
  const services = withReport();
  vi.mocked(services.discardExpiredLot).mockResolvedValue({
    kind: "ok",
    value: { movementId: "movement-9", quantity: 6, balance: 0, superseded: false },
  });
  const screen = await renderScreen(services, { filters: expiringLotsFilters.parse(PERIOD) });
  await expect.element(screen.getByText("Queso cremoso")).toBeVisible();
  expect(screen.getByRole("button", { name: /Dar de baja/ }).elements()).toHaveLength(1);

  await userEvent.click(
    screen.getByRole("button", { name: "Dar de baja el lote Compra 08/10/2026 de Yogur natural" }),
  );

  expect(services.discardExpiredLot).toHaveBeenCalledWith(expiredYogurtLot.id);
  await expect.element(screen.getByText("Lote dado de baja")).toBeVisible();
});

test("reports the period typed once both days are complete, keeping the other filters", async () => {
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(withReport(), {
    filters: expiringLotsFilters.parse({ search: "chía" }),
    onFiltersChange,
  });
  await expect.poll(() => periodSegments(screen).slice(0, 3)).toEqual(["13", "10", "2026"]);

  await typePeriodStart(screen, "01112026");

  await expect.poll(() => onFiltersChange.mock.lastCall?.[0]).toEqual({
    search: "chía",
    category: "ALL",
    expiry: "all",
    from: "2026-11-01",
    to: "2026-11-12",
  });
});

test("says no lot expires in the period when the report is empty", async () => {
  const screen = await renderScreen(withReport(expiringLotsReport([])), {
    filters: expiringLotsFilters.parse(PERIOD),
  });

  await expect.element(screen.getByText("No hay lotes que venzan en este período")).toBeVisible();
});

test("downloads a spreadsheet of the lots the report answered for the period", async () => {
  const downloads = spyOnDownloads();
  const screen = await renderScreen(withReport(expiringLotsReport([cheeseLot, breadLot])));
  await expect.poll(() => periodSegments(screen).slice(0, 3)).toEqual(["13", "10", "2026"]);

  await userEvent.click(screen.getByRole("button", { name: "Descargar planilla" }));

  await expect.poll(() => downloads.names).toEqual(["lotes-por-vencer-2026-10-13-2026-11-12.xlsx"]);
  const file = await readDownloadedXlsx(downloads.blobs[0]);
  expect(file.sheetNames).toEqual(["Resumen", "Lotes por vencer"]);
  expect(file.sheet(1).get("A2")?.value).toBe("Queso cremoso");
  expect(file.sheet(1).get("A3")?.value).toBe("Pan lactal");
});

test("has its download disabled while the report loads and after loading it fails", async () => {
  const loading = listed();
  const failing = listed();
  vi.mocked(failing.fetchExpiringLotsReport).mockResolvedValue({ kind: "failed" });

  const loadingScreen = await renderScreen(loading);
  await expect
    .element(loadingScreen.getByRole("button", { name: "Descargar planilla" }))
    .toBeDisabled();
  await loadingScreen.unmount();

  const failedScreen = await renderScreen(failing);
  await expect.poll(() => failing.fetchExpiringLotsReport).toHaveBeenCalled();
  await expect
    .element(failedScreen.getByRole("button", { name: "Descargar planilla" }))
    .toBeDisabled();
});

test("ends the session when the report says it is over", async () => {
  const services = listed();
  vi.mocked(services.fetchExpiringLotsReport).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded).toHaveBeenCalled();
});
