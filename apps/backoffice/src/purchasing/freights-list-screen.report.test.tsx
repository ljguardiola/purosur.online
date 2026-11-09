import { FieldSizeProvider } from "@purosur/ui";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { readDownloadedXlsx } from "../platform/spreadsheet/test-support/read-xlsx";
import { render } from "../shell/test-support/render-with-router";
import { periodSegments, typePeriodEnd, typePeriodStart } from "../shell/test-support/report-dates";
import { spyOnDownloads } from "../shell/test-support/spy-on-downloads";
import { FreightsListScreen } from "./freights-list-screen";
import type { FreightsListScreenServices } from "./freights-list-services";
import { type FreightsListFilters, freightsListFilters } from "./routes";
import { quarterFreightReport } from "./test-support/freight-report-fixtures";
import { envioDesdeBuenosAires, linkablePurchases } from "./test-support/freights";

beforeEach(async () => {
  await page.viewport(1280, 900);
  window.history.pushState(null, "", "/");
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createServices(): FreightsListScreenServices {
  return {
    fetchFreights: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { items: [envioDesdeBuenosAires], count: 1, totalCents: 1_850_000 },
    }),
    fetchFreightReport: vi.fn().mockResolvedValue({ kind: "ok", value: quarterFreightReport }),
    fetchSupplierName: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { kind: "found", name: "Distribuidora Andina" },
    }),
    fetchLinkablePurchases: vi.fn().mockResolvedValue({ kind: "ok", value: linkablePurchases }),
    recordFreight: vi.fn(),
    editFreight: vi.fn(),
  };
}

function ControlledScreen({
  services,
  filters: initial = {},
  onFiltersChange = () => {},
  onSessionEnded = () => {},
  supplierFilter,
}: {
  services: FreightsListScreenServices;
  filters?: Partial<Parameters<typeof freightsListFilters.parse>[0]>;
  onFiltersChange?: (filters: FreightsListFilters) => void;
  onSessionEnded?: () => void;
  supplierFilter?: { supplierId: string; onClear: () => void };
}) {
  const [filters, setFilters] = useState(freightsListFilters.parse(initial));
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <FreightsListScreen
          services={services}
          filters={filters}
          onFiltersChange={(next) => {
            onFiltersChange(next);
            setFilters(next);
          }}
          onSessionEnded={onSessionEnded}
          {...(supplierFilter === undefined ? {} : { supplierFilter })}
        />
      </main>
    </FieldSizeProvider>
  );
}

function renderScreen(services: FreightsListScreenServices, options = {}) {
  return render(<ControlledScreen services={services} {...options} />);
}

type Screen = Awaited<ReturnType<typeof renderScreen>>;

function reportTable(screen: Screen) {
  return screen.getByRole("table", { name: "Flete por período", exact: true });
}

test("lists the freights with the grouping by month off", async () => {
  const services = createServices();
  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("table", { name: "Fletes", exact: true })).toBeVisible();
  await expect.element(screen.getByRole("switch", { name: "Agrupar por mes" })).not.toBeChecked();
  expect(services.fetchFreightReport).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Descargar planilla" }).query()).toBeNull();
});

test("reports the grouping, with the search and the period, when it is turned on", async () => {
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(createServices(), { onFiltersChange });

  await userEvent.click(screen.getByText("Agrupar por mes", { exact: true }));

  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({
      search: "",
      period: 90,
      byMonth: true,
      from: "",
      to: "",
    });
});

test("shows the months and their totals instead of the freights list", async () => {
  const services = createServices();
  const screen = await renderScreen(services, { filters: { byMonth: true } });

  await expect.element(reportTable(screen).getByText("octubre de 2026")).toBeVisible();
  await expect.element(screen.getByText(/^Total de fletes\$ 1\.750,50$/)).toBeVisible();
  expect(services.fetchFreightReport).toHaveBeenCalledWith({});
  expect(services.fetchFreights).not.toHaveBeenCalled();
  expect(screen.getByRole("table", { name: "Fletes", exact: true }).query()).toBeNull();
});

test("hides the search, the period and the supplier filter, which do not apply to the months", async () => {
  const screen = await renderScreen(createServices(), {
    filters: { byMonth: true },
    supplierFilter: {
      supplierId: envioDesdeBuenosAires.purchases[0]?.supplier.id ?? "",
      onClear: () => {},
    },
  });
  await expect.element(reportTable(screen)).toBeVisible();

  expect(screen.getByPlaceholder("Buscar por descripción o medio").query()).toBeNull();
  expect(screen.getByRole("button", { name: /^Período:/ }).query()).toBeNull();
  expect(screen.getByRole("button", { name: /^Proveedor:/ }).query()).toBeNull();
});

test("returns to the freights list when the grouping is turned off", async () => {
  const screen = await renderScreen(createServices(), { filters: { byMonth: true } });
  await expect.element(reportTable(screen)).toBeVisible();

  await userEvent.click(screen.getByText("Agrupar por mes", { exact: true }));

  await expect.element(screen.getByRole("table", { name: "Fletes", exact: true })).toBeVisible();
  await expect.element(screen.getByPlaceholder("Buscar por descripción o medio")).toBeVisible();
});

test("asks the report for the range in the filters and shows the range it answered", async () => {
  const services = createServices();
  const screen = await renderScreen(services, { filters: { byMonth: true } });
  await expect.poll(() => periodSegments(screen).slice(0, 3)).toEqual(["1", "9", "2026"]);
  await screen.unmount();

  await renderScreen(services, {
    filters: { byMonth: true, from: "2026-10-02", to: "2026-10-05" },
  });
  await expect
    .poll(() => vi.mocked(services.fetchFreightReport).mock.lastCall)
    .toEqual([{ from: "2026-10-02", to: "2026-10-05" }]);
});

test("reports a typed range together with the grouping and asks the report again", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(services, { filters: { byMonth: true }, onFiltersChange });
  await expect.element(reportTable(screen).getByText("octubre de 2026")).toBeVisible();

  await typePeriodStart(screen, "01102026");
  await typePeriodEnd(screen, "07102026");

  await expect
    .poll(() => vi.mocked(services.fetchFreightReport).mock.lastCall)
    .toEqual([{ from: "2026-10-01", to: "2026-10-07" }]);
  expect(onFiltersChange).toHaveBeenLastCalledWith({
    search: "",
    period: 90,
    byMonth: true,
    from: "2026-10-01",
    to: "2026-10-07",
  });
});

test("downloads a spreadsheet of the months shown, for the range that was asked", async () => {
  const downloads = spyOnDownloads();
  const services = createServices();
  const screen = await renderScreen(services, {
    filters: { byMonth: true, from: "2026-09-01", to: "2026-10-31" },
  });
  await expect.element(reportTable(screen).getByText("octubre de 2026")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Descargar planilla" }));

  await expect
    .poll(() => downloads.names)
    .toEqual(["flete-por-periodo-2026-09-01-2026-10-31.xlsx"]);
  const file = await readDownloadedXlsx(downloads.blobs[0]);
  expect(file.sheetNames[0]).toBe("Resumen");
  expect(services.fetchFreightReport).toHaveBeenCalledWith({
    from: "2026-09-01",
    to: "2026-10-31",
  });
});

test("ends the session when the cloud says it is over while reading the report", async () => {
  const services = createServices();
  vi.mocked(services.fetchFreightReport).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { filters: { byMonth: true }, onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
