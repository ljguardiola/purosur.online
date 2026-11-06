import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { readDownloadedXlsx } from "../platform/spreadsheet/test-support/read-xlsx";
import { type ReportFilters, reportFiltersSearch } from "../shell/report-filters-search";
import { render } from "../shell/test-support/render-with-router";
import { periodSegments } from "../shell/test-support/report-dates";
import { BACK_REGISTER_ID, FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import {
  createReportRegisterFilterServices,
  type ReportRegisterFilterServices,
  reportRegisterFieldForTests,
} from "../shell/test-support/report-register-filter";
import { spyOnDownloads } from "../shell/test-support/spy-on-downloads";
import { SalesByDayScreen } from "./sales-by-day-screen";
import type { SalesByDayScreenServices } from "./sales-by-day-services";
import { todayReport, weekReport } from "./test-support/sales-fixtures";

function createServices(): SalesByDayScreenServices {
  const services = { fetchSalesReport: vi.fn() };
  services.fetchSalesReport.mockResolvedValue({ kind: "ok", value: weekReport });
  return services;
}

type Handlers = {
  filters?: ReportFilters;
  onFiltersChange?: (filters: ReportFilters) => void;
  onSessionEnded?: () => void;
};

function ControlledScreen({
  services,
  filters: initial = reportFiltersSearch.parse({}),
  onFiltersChange = () => {},
  onSessionEnded = () => {},
  registerServices,
}: Handlers & {
  services: SalesByDayScreenServices;
  registerServices: ReportRegisterFilterServices;
}) {
  const [filters, setFilters] = useState(initial);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <SalesByDayScreen
          services={services}
          filters={filters}
          onFiltersChange={(next) => {
            onFiltersChange(next);
            setFilters(next);
          }}
          onSessionEnded={onSessionEnded}
          registerFilter={reportRegisterFieldForTests(registerServices, onSessionEnded)}
        />
      </main>
    </FieldSizeProvider>
  );
}

function renderScreen(
  services: SalesByDayScreenServices,
  {
    registerServices = createReportRegisterFilterServices(),
    ...handlers
  }: Handlers & {
    registerServices?: ReportRegisterFilterServices;
  } = {},
) {
  return render(
    <ControlledScreen services={services} registerServices={registerServices} {...handlers} />,
  );
}

test("shows each day with its sales and total, and the totals of the range", async () => {
  const screen = await renderScreen(createServices());

  await expect
    .element(screen.getByRole("heading", { name: "Ventas por día o por rango", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByText("Reportes", { exact: true })).toBeVisible();
  const table = screen.getByRole("table", { name: "Ventas por día" });
  await expect.element(table.getByText("02/10/2026")).toBeVisible();
  await expect.element(table.getByText("$ 12.500,50")).toBeVisible();
  await expect.element(table.getByText("05/10/2026")).toBeVisible();
  await expect.element(table.getByText("$ 980,00")).toBeVisible();
  await expect.element(screen.getByText("Total vendido")).toBeVisible();
  await expect.element(screen.getByText("$ 13.480,50")).toBeVisible();
  await expect.element(screen.getByText("Cantidad de ventas")).toBeVisible();
  await expect.element(screen.getByText("4", { exact: true })).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("asks the cloud for no range when the URL has none, and shows the range it answered", async () => {
  const services = createServices();

  const screen = await renderScreen(services);

  await expect.poll(() => periodSegments(screen).slice(0, 3)).toEqual(["1", "10", "2026"]);
  expect(periodSegments(screen).slice(3)).toEqual(["7", "10", "2026"]);
  expect(services.fetchSalesReport).toHaveBeenCalledWith({});
});

test("asks the cloud for the range and the register the URL names", async () => {
  const services = createServices();

  const screen = await renderScreen(services, {
    filters: reportFiltersSearch.parse({
      from: "2026-10-02",
      to: "2026-10-05",
      register: BACK_REGISTER_ID,
    }),
  });

  await expect.element(screen.getByText("Total vendido")).toBeVisible();
  expect(services.fetchSalesReport).toHaveBeenCalledWith({
    from: "2026-10-02",
    to: "2026-10-05",
    register_id: BACK_REGISTER_ID,
  });
  expect(periodSegments(screen).slice(0, 3)).toEqual(["2", "10", "2026"]);
  await expect
    .element(screen.getByRole("combobox", { name: /^Caja:/ }))
    .toHaveValue("Caja del fondo");
});

test("shows placeholders while the report loads", async () => {
  const services = createServices();
  vi.mocked(services.fetchSalesReport).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("table", { name: "Ventas por día" }))
    .toHaveAttribute("aria-busy", "true");
  expect(screen.getByText("$ 13.480,50").query()).toBeNull();
});

test("says there are no sales in the period when there are none", async () => {
  const services = createServices();
  vi.mocked(services.fetchSalesReport).mockResolvedValue({ kind: "ok", value: todayReport });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No hay ventas en este período")).toBeVisible();
  await expect.element(screen.getByText("$ 0,00")).toBeVisible();
});

test("says the register has no sales in the period when one is chosen and none were made", async () => {
  const services = createServices();
  vi.mocked(services.fetchSalesReport).mockResolvedValue({ kind: "ok", value: todayReport });

  const screen = await renderScreen(services, {
    filters: reportFiltersSearch.parse({ register: FRONT_REGISTER_ID }),
  });

  await expect
    .element(screen.getByText("No hay ventas de esta caja en este período"))
    .toBeVisible();
});

test("shows a failed load with a retry that loads the report again", async () => {
  const services = createServices();
  vi.mocked(services.fetchSalesReport)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: weekReport });
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("02/10/2026")).toBeVisible();
  expect(services.fetchSalesReport).toHaveBeenCalledTimes(2);
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.fetchSalesReport).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("asks the cloud again for the register chosen", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("02/10/2026")).toBeVisible();

  await userEvent.click(screen.getByRole("combobox", { name: /Caja:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  await expect
    .poll(() => vi.mocked(services.fetchSalesReport).mock.lastCall)
    .toEqual([{ register_id: FRONT_REGISTER_ID }]);
});

test("keeps the previous days in view, marked as updating, while another register loads", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("02/10/2026")).toBeVisible();
  vi.mocked(services.fetchSalesReport).mockReturnValue(new Promise(() => {}));

  await userEvent.click(screen.getByRole("combobox", { name: /Caja:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  await expect
    .element(screen.getByRole("table", { name: "Ventas por día" }))
    .toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByText("02/10/2026")).toBeVisible();
});

test("still reports the sales when the registers cannot be listed, offering only all of them", async () => {
  const registerServices = createReportRegisterFilterServices();
  vi.mocked(registerServices.fetchReportRegisters).mockResolvedValue({ kind: "failed" });

  const screen = await renderScreen(createServices(), { registerServices });

  await expect.element(screen.getByText("02/10/2026")).toBeVisible();
  await userEvent.click(screen.getByRole("combobox", { name: /Caja:/ }));
  await expect.element(screen.getByRole("option", { name: "Todas" })).toBeVisible();
  expect(screen.getByRole("option").elements()).toHaveLength(1);
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("downloads a spreadsheet of the days shown, with the applied period and register and the totals", async () => {
  const downloads = spyOnDownloads();
  const screen = await renderScreen(createServices(), {
    filters: reportFiltersSearch.parse({
      from: "2026-10-01",
      to: "2026-10-07",
      register: BACK_REGISTER_ID,
    }),
  });
  await expect
    .element(screen.getByRole("combobox", { name: /^Caja:/ }))
    .toHaveValue("Caja del fondo");
  await expect.element(screen.getByText("02/10/2026")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Descargar planilla" }));

  await expect
    .poll(() => downloads.names)
    .toEqual(["ventas-por-dia-o-por-rango-2026-10-01-2026-10-07.xlsx"]);
  const file = await readDownloadedXlsx(downloads.blobs[0]);
  expect(file.sheetNames).toEqual(["Resumen", "Ventas por día"]);
  const summary = file.sheet(0);
  expect(summary.get("A4")?.value).toBe("Caja");
  expect(summary.get("B4")?.value).toBe("Caja del fondo");
  expect(summary.get("A5")?.value).toBe("Total vendido");
  expect(summary.get("B5")?.value).toBe("13480.5");
  const days = file.sheet(1);
  expect(days.get("B2")?.value).toBe("3");
  expect(days.get("C2")?.value).toBe("12500.5");
  expect(days.get("C3")?.value).toBe("980");
});

test("is disabled while the report loads and after loading fails", async () => {
  const services = createServices();
  vi.mocked(services.fetchSalesReport).mockReturnValue(new Promise(() => {}));
  const loading = await renderScreen(services);
  await expect.element(loading.getByRole("button", { name: "Descargar planilla" })).toBeDisabled();
  await loading.unmount();

  vi.mocked(services.fetchSalesReport).mockResolvedValue({ kind: "failed" });
  const failed = await renderScreen(services);
  await expect.element(failed.getByRole("button", { name: "Reintentar" })).toBeVisible();
  await expect.element(failed.getByRole("button", { name: "Descargar planilla" })).toBeDisabled();
});

test("writes the register chosen as the filter shows it when the registers cannot be listed", async () => {
  const downloads = spyOnDownloads();
  const registerServices = createReportRegisterFilterServices();
  vi.mocked(registerServices.fetchReportRegisters).mockResolvedValue({ kind: "failed" });
  const screen = await renderScreen(createServices(), {
    filters: reportFiltersSearch.parse({ register: BACK_REGISTER_ID }),
    registerServices,
  });
  await expect.element(screen.getByRole("combobox", { name: /^Caja:/ })).toHaveValue("La elegida");
  await expect.element(screen.getByText("02/10/2026")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Descargar planilla" }));

  await expect.poll(() => downloads.blobs.length).toBe(1);
  const file = await readDownloadedXlsx(downloads.blobs[0]);
  expect(file.sheet(0).get("B4")?.value).toBe("La elegida");
});

test("is disabled while the name of the register chosen loads", async () => {
  const registerServices = createReportRegisterFilterServices();
  vi.mocked(registerServices.fetchReportRegisters).mockReturnValue(new Promise(() => {}));
  const screen = await renderScreen(createServices(), {
    filters: reportFiltersSearch.parse({ register: BACK_REGISTER_ID }),
    registerServices,
  });

  await expect.element(screen.getByText("02/10/2026")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Descargar planilla" })).toBeDisabled();
});
