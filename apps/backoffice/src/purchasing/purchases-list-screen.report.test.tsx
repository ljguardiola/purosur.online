import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { readDownloadedXlsx } from "../platform/spreadsheet/test-support/read-xlsx";
import { periodSegments, typePeriodEnd, typePeriodStart } from "../shell/test-support/report-dates";
import { spyOnDownloads } from "../shell/test-support/spy-on-downloads";
import { compraDeMiel } from "./test-support/purchases";
import {
  createServices,
  loaded,
  renderScreen,
  type Screen,
} from "./test-support/purchases-list-screen";

beforeEach(async () => {
  await page.viewport(1280, 900);
  window.history.pushState(null, "", "/");
});

afterEach(() => {
  vi.restoreAllMocks();
});

function reportTable(screen: Screen) {
  return screen.getByRole("table", { name: "Compras por proveedor", exact: true });
}

test("lists the purchases while they are not grouped by supplier, with the grouping off", async () => {
  const services = createServices();
  const screen = await loaded(services);

  await expect
    .element(screen.getByRole("switch", { name: "Agrupar por proveedor" }))
    .not.toBeChecked();
  expect(services.fetchPurchasesReport).not.toHaveBeenCalled();
  expect(reportTable(screen).query()).toBeNull();
});

test("reports the grouping when it is turned on", async () => {
  const onFiltersChange = vi.fn();
  const screen = await loaded(createServices(), { onFiltersChange });

  await userEvent.click(screen.getByText("Agrupar por proveedor", { exact: true }));

  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({ bySupplier: true, from: "", to: "" });
});

test("shows each supplier's purchases and totals instead of the purchases list", async () => {
  const services = createServices();
  vi.mocked(services.fetchPurchases).mockResolvedValue({ kind: "ok", value: [compraDeMiel] });
  const screen = await renderScreen(services, { filters: { bySupplier: true } });

  const dairy = reportTable(screen).getByRole("row", { name: /^Lácteos del Sur/ });
  await expect.element(dairy.getByText("$ 1.750,50", { exact: true })).toBeVisible();
  await expect.element(screen.getByText(/^Total comprado\$ 2\.575,50$/)).toBeVisible();
  expect(services.fetchPurchasesReport).toHaveBeenCalledWith({});
  expect(services.fetchPurchases).not.toHaveBeenCalled();
  expect(screen.getByRole("table", { name: "Compras", exact: true }).query()).toBeNull();
});

test("keeps the grouping toggle on while grouped and returns to the list when it is turned off", async () => {
  const services = createServices();
  vi.mocked(services.fetchPurchases).mockResolvedValue({ kind: "ok", value: [compraDeMiel] });
  const screen = await renderScreen(services, { filters: { bySupplier: true } });
  await expect.element(reportTable(screen)).toBeVisible();

  await userEvent.click(screen.getByText("Agrupar por proveedor", { exact: true }));

  await expect.element(screen.getByRole("table", { name: "Compras", exact: true })).toBeVisible();
  expect(reportTable(screen).query()).toBeNull();
});

test("hides the supplier filter while grouped by supplier", async () => {
  const services = createServices({
    fetchSupplierName: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { kind: "found", name: "Distribuidora Andina" },
    }),
  });
  const screen = await renderScreen(services, {
    filters: { bySupplier: true },
    supplierFilter: { supplierId: compraDeMiel.supplier.id, onClear: () => {} },
  });
  await expect.element(reportTable(screen)).toBeVisible();

  expect(screen.getByRole("button", { name: /^Proveedor:/ }).query()).toBeNull();
});

test("shows the range the report answered and asks for the one in the filters", async () => {
  const services = createServices();
  const screen = await renderScreen(services, { filters: { bySupplier: true } });

  await expect.poll(() => periodSegments(screen).slice(0, 3)).toEqual(["1", "9", "2026"]);
  await screen.unmount();

  await renderScreen(services, {
    filters: { bySupplier: true, from: "2026-10-02", to: "2026-10-05" },
  });
  await expect
    .poll(() => vi.mocked(services.fetchPurchasesReport).mock.lastCall)
    .toEqual([{ from: "2026-10-02", to: "2026-10-05" }]);
});

test("reports a typed range together with the grouping and asks the report again", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(services, {
    filters: { bySupplier: true },
    onFiltersChange,
  });
  await expect.element(reportTable(screen).getByText("Panificados Norte")).toBeVisible();

  await typePeriodStart(screen, "01102026");
  await typePeriodEnd(screen, "07102026");

  await expect
    .poll(() => vi.mocked(services.fetchPurchasesReport).mock.lastCall)
    .toEqual([{ from: "2026-10-01", to: "2026-10-07" }]);
  expect(onFiltersChange).toHaveBeenLastCalledWith({
    bySupplier: true,
    from: "2026-10-01",
    to: "2026-10-07",
  });
});

test("downloads a spreadsheet of the suppliers shown, for the period the report answered", async () => {
  const downloads = spyOnDownloads();
  const screen = await renderScreen(createServices(), { filters: { bySupplier: true } });
  await expect.element(reportTable(screen).getByText("Panificados Norte")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Descargar planilla" }));

  await expect
    .poll(() => downloads.names)
    .toEqual(["compras-por-proveedor-2026-09-01-2026-10-31.xlsx"]);
  const file = await readDownloadedXlsx(downloads.blobs[0]);
  expect(file.sheetNames).toEqual(["Resumen", "Compras por proveedor", "Totales por proveedor"]);
});

test("offers no spreadsheet or range while the purchases are listed", async () => {
  const screen = await loaded(createServices());

  expect(screen.getByRole("group", { name: /^Período/ }).query()).toBeNull();
  expect(screen.getByRole("button", { name: "Descargar planilla" }).query()).toBeNull();
});

test("ends the session when the cloud says it is over while reading the report", async () => {
  const services = createServices();
  vi.mocked(services.fetchPurchasesReport).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { filters: { bySupplier: true }, onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
