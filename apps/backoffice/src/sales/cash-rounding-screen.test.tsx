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
import { CashRoundingScreen } from "./cash-rounding-screen";
import type { CashRoundingScreenServices } from "./cash-rounding-services";
import { cashRoundingReport, noCashRoundingReport } from "./test-support/sales-fixtures";

function createServices(): CashRoundingScreenServices {
  const services = { fetchCashRounding: vi.fn() };
  services.fetchCashRounding.mockResolvedValue({ kind: "ok", value: cashRoundingReport });
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
  services: CashRoundingScreenServices;
  registerServices: ReportRegisterFilterServices;
}) {
  const [filters, setFilters] = useState(initial);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <CashRoundingScreen
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
  services: CashRoundingScreenServices,
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

test("shows each day and register with the rounding and the rounded sales, and the totals of the range", async () => {
  const screen = await renderScreen(createServices());

  await expect
    .element(screen.getByRole("heading", { name: "Redondeo en efectivo", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByText("Reportes", { exact: true })).toBeVisible();
  const table = screen.getByRole("table", { name: "Redondeo por día y caja" });
  await expect.element(table.getByRole("columnheader", { name: "Día" })).toBeVisible();
  await expect.element(table.getByRole("columnheader", { name: "Caja" })).toBeVisible();
  await expect.element(table.getByRole("columnheader", { name: "Redondeo" })).toBeVisible();
  await expect
    .element(table.getByRole("columnheader", { name: "Ventas redondeadas" }))
    .toBeVisible();
  await expect.element(table.getByText("Caja principal")).toBeVisible();
  await expect.element(table.getByText("$ 150,00")).toBeVisible();
  await expect.element(table.getByText("Caja del fondo")).toBeVisible();
  await expect.element(table.getByText("$ 70,50")).toBeVisible();
  expect(table.getByText("02/10/2026").elements()).toHaveLength(2);
  await expect.element(screen.getByText("Redondeo total")).toBeVisible();
  await expect.element(screen.getByText("$ 220,50")).toBeVisible();
  await expect
    .element(screen.getByText("Ventas redondeadas", { exact: true }).first())
    .toBeVisible();
  await expect.element(screen.getByText("4", { exact: true })).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("asks the cloud for no range when the URL has none, and shows the range it answered", async () => {
  const services = createServices();

  const screen = await renderScreen(services);

  await expect.poll(() => periodSegments(screen).slice(0, 3)).toEqual(["1", "10", "2026"]);
  expect(periodSegments(screen).slice(3)).toEqual(["7", "10", "2026"]);
  expect(services.fetchCashRounding).toHaveBeenCalledWith({});
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

  await expect.element(screen.getByText("Redondeo total")).toBeVisible();
  expect(services.fetchCashRounding).toHaveBeenCalledWith({
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
  vi.mocked(services.fetchCashRounding).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("table", { name: "Redondeo por día y caja" }))
    .toHaveAttribute("aria-busy", "true");
  expect(screen.getByText("$ 220,50").query()).toBeNull();
});

test("says there is no rounding in the period when there is none", async () => {
  const services = createServices();
  vi.mocked(services.fetchCashRounding).mockResolvedValue({
    kind: "ok",
    value: noCashRoundingReport,
  });

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByText("No hubo redondeo en efectivo en el período."))
    .toBeVisible();
  await expect.element(screen.getByText("$ 0,00")).toBeVisible();
});

test("says so too when a register is chosen and none of its sales were rounded", async () => {
  const services = createServices();
  vi.mocked(services.fetchCashRounding).mockResolvedValue({
    kind: "ok",
    value: noCashRoundingReport,
  });

  const screen = await renderScreen(services, {
    filters: reportFiltersSearch.parse({ register: FRONT_REGISTER_ID }),
  });

  await expect
    .element(screen.getByText("No hubo redondeo en efectivo en el período."))
    .toBeVisible();
});

test("shows a failed load with a retry that loads the report again", async () => {
  const services = createServices();
  vi.mocked(services.fetchCashRounding)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: cashRoundingReport });
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Caja principal")).toBeVisible();
  expect(services.fetchCashRounding).toHaveBeenCalledTimes(2);
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.fetchCashRounding).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("asks the cloud again for the register chosen", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Caja principal")).toBeVisible();

  await userEvent.click(screen.getByRole("combobox", { name: /Caja:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  await expect
    .poll(() => vi.mocked(services.fetchCashRounding).mock.lastCall)
    .toEqual([{ register_id: FRONT_REGISTER_ID }]);
});

test("keeps the previous rows in view, marked as updating, while another register loads", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  const table = screen.getByRole("table", { name: "Redondeo por día y caja" });
  await expect.element(table.getByText("$ 150,00")).toBeVisible();
  vi.mocked(services.fetchCashRounding).mockReturnValue(new Promise(() => {}));

  await userEvent.click(screen.getByRole("combobox", { name: /Caja:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  await expect.element(table).toHaveAttribute("aria-busy", "true");
  await expect.element(table.getByText("$ 150,00")).toBeVisible();
});

test("still reports the rounding when the registers cannot be listed, offering only all of them", async () => {
  const registerServices = createReportRegisterFilterServices();
  vi.mocked(registerServices.fetchReportRegisters).mockResolvedValue({ kind: "failed" });

  const screen = await renderScreen(createServices(), { registerServices });

  await expect.element(screen.getByText("Caja principal")).toBeVisible();
  await userEvent.click(screen.getByRole("combobox", { name: /Caja:/ }));
  await expect.element(screen.getByRole("option", { name: "Todas" })).toBeVisible();
  expect(screen.getByRole("option").elements()).toHaveLength(1);
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("downloads a spreadsheet of the rows shown, with the applied period and register and the totals", async () => {
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
  await expect.element(screen.getByText("Caja principal")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Descargar planilla" }));

  await expect
    .poll(() => downloads.names)
    .toEqual(["redondeo-en-efectivo-2026-10-01-2026-10-07.xlsx"]);
  const file = await readDownloadedXlsx(downloads.blobs[0]);
  expect(file.sheetNames).toEqual(["Resumen", "Redondeo en efectivo"]);
  const summary = file.sheet(0);
  expect(summary.get("A4")?.value).toBe("Caja");
  expect(summary.get("B4")?.value).toBe("Caja del fondo");
  expect(summary.get("A5")?.value).toBe("Redondeo");
  expect(summary.get("B5")?.value).toBe("220.5");
  const rows = file.sheet(1);
  expect(rows.get("B2")?.value).toBe("Caja del fondo");
  expect(rows.get("C2")?.value).toBe("70.5");
  expect(rows.get("D3")?.value).toBe("3");
});

test("is disabled while the report loads and after loading fails", async () => {
  const services = createServices();
  vi.mocked(services.fetchCashRounding).mockReturnValue(new Promise(() => {}));
  const loading = await renderScreen(services);
  await expect.element(loading.getByRole("button", { name: "Descargar planilla" })).toBeDisabled();
  await loading.unmount();

  vi.mocked(services.fetchCashRounding).mockResolvedValue({ kind: "failed" });
  const failed = await renderScreen(services);
  await expect.element(failed.getByRole("button", { name: "Reintentar" })).toBeVisible();
  await expect.element(failed.getByRole("button", { name: "Descargar planilla" })).toBeDisabled();
});
