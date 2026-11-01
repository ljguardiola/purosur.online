import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { readDownloadedXlsx } from "../platform/spreadsheet/test-support/read-xlsx";
import { type ReportPeriodFilters, reportPeriodSearch } from "../shell/report-filters-search";
import { render } from "../shell/test-support/render-with-router";
import { dateSegments, typeDate } from "../shell/test-support/report-dates";
import { spyOnDownloads } from "../shell/test-support/spy-on-downloads";
import { LossesByReasonReportScreen } from "./losses-by-reason-report-screen";
import type { LossesByReasonReportScreenServices } from "./losses-by-reason-report-services";
import {
  expiredReason,
  lossesByReasonReport,
  returnDiscardReason,
  spoiledReason,
} from "./test-support/losses-by-reason-report-fixtures";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createServices(): LossesByReasonReportScreenServices {
  return { fetchLossesByReasonReport: vi.fn() };
}

function listed(report = lossesByReasonReport()) {
  const services = createServices();
  vi.mocked(services.fetchLossesByReasonReport).mockResolvedValue({ kind: "ok", value: report });
  return services;
}

function Harness({
  services,
  initial = reportPeriodSearch.parse({}),
  onFiltersChange = () => {},
  onSessionEnded = () => {},
}: {
  services: LossesByReasonReportScreenServices;
  initial?: ReportPeriodFilters;
  onFiltersChange?: (filters: ReportPeriodFilters) => void;
  onSessionEnded?: () => void;
}) {
  const [filters, setFilters] = useState(initial);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <LossesByReasonReportScreen
          services={services}
          filters={filters}
          onFiltersChange={(next) => {
            onFiltersChange(next);
            setFilters(next);
          }}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>
  );
}

function renderScreen(
  services: LossesByReasonReportScreenServices,
  props: Omit<Parameters<typeof Harness>[0], "services"> = {},
) {
  return render(<Harness services={services} {...props} />);
}

test("titles the report under the stock reports", async () => {
  const screen = await renderScreen(listed());

  await expect
    .element(screen.getByRole("heading", { name: "Mermas por motivo", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByText("Reportes · Stock")).toBeVisible();
});

test("totals the losses and the reasons that have them", async () => {
  const screen = await renderScreen(listed());

  const figureOf = (label: string) =>
    screen.getByText(label, { exact: true }).first().element().parentElement?.textContent;
  await expect.poll(() => figureOf("Pérdidas")).toBe("Pérdidas4 pérdidas");
  expect(figureOf("Motivos")).toBe("Motivos2");
});

test("keeps the reasons in the order the cloud answers them", async () => {
  const screen = await renderScreen(
    listed(lossesByReasonReport([expiredReason, returnDiscardReason, spoiledReason])),
  );
  await expect.element(screen.getByRole("region", { name: "Mal estado" })).toBeVisible();

  const headings = screen
    .getByRole("heading", { level: 2 })
    .elements()
    .map((heading) => heading.textContent);
  expect(headings).toEqual(["Vencimiento", "Descarte de devolución", "Mal estado"]);
  await expectNoAccessibilityViolations(screen.container);
});

test("offers no register filter", async () => {
  const screen = await renderScreen(listed());
  await expect.element(screen.getByRole("region", { name: "Mal estado" })).toBeVisible();

  expect(screen.getByText("Caja", { exact: false }).query()).toBeNull();
});

test("shows the period the cloud answered while the URL names none", async () => {
  const screen = await renderScreen(listed());

  await expect.poll(() => dateSegments(screen, "Desde")).toEqual(["1", "10", "2026"]);
  expect(dateSegments(screen, "Hasta")).toEqual(["31", "10", "2026"]);
});

test("asks for the cloud's default period when the URL names none", async () => {
  const services = listed();

  await renderScreen(services);

  await expect.poll(() => services.fetchLossesByReasonReport).toHaveBeenCalledWith({});
});

test("asks for the period the URL carries", async () => {
  const services = listed();

  await renderScreen(services, {
    initial: reportPeriodSearch.parse({ from: "2026-12-01", to: "2026-12-31" }),
  });

  await expect
    .poll(() => services.fetchLossesByReasonReport)
    .toHaveBeenCalledWith({ from: "2026-12-01", to: "2026-12-31" });
});

test("reports the period typed once both days are complete", async () => {
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(listed(), { onFiltersChange });
  await expect.poll(() => dateSegments(screen, "Desde")).toEqual(["1", "10", "2026"]);

  await typeDate(screen, "Desde", "10092026");

  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({ from: "2026-09-10", to: "2026-10-31" });
});

test("keeps showing the report while the next period loads", async () => {
  const services = listed();
  const screen = await renderScreen(services);
  await expect.poll(() => dateSegments(screen, "Desde")).toEqual(["1", "10", "2026"]);
  vi.mocked(services.fetchLossesByReasonReport).mockReturnValue(new Promise(() => {}));

  await typeDate(screen, "Desde", "10092026");

  await expect
    .poll(() => services.fetchLossesByReasonReport)
    .toHaveBeenLastCalledWith({ from: "2026-09-10", to: "2026-10-31" });
  await expect.element(screen.getByText("Queso cremoso")).toBeVisible();
  await expect
    .element(screen.getByRole("table", { name: "Productos perdidos por Mal estado" }))
    .toHaveAttribute("aria-busy", "true");
});

test("shows the screen loading while the report is on its way", async () => {
  const services = createServices();
  vi.mocked(services.fetchLossesByReasonReport).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Pérdidas", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Motivos", { exact: true })).toBeVisible();
  expect(screen.getByRole("region").query()).toBeNull();
  expect(screen.getByText("No hay mermas en este período").query()).toBeNull();
});

test("says there are no losses when the report is empty", async () => {
  const screen = await renderScreen(listed(lossesByReasonReport([])));

  await expect.element(screen.getByText("No hay mermas en este período")).toBeVisible();
  await expect.element(screen.getByText("0 pérdidas", { exact: true })).toBeVisible();
});

test("shows a failed load with a retry that loads the report again, and no figures", async () => {
  const services = createServices();
  vi.mocked(services.fetchLossesByReasonReport)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: lossesByReasonReport() });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No pudimos abrir las mermas por motivo")).toBeVisible();
  expect(screen.getByText("Motivos").query()).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByRole("region", { name: "Mal estado" })).toBeVisible();
  expect(services.fetchLossesByReasonReport).toHaveBeenCalledTimes(2);
});

test("loads a period again from the loading placeholder when retrying after it failed", async () => {
  const services = listed();
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("region", { name: "Mal estado" })).toBeVisible();
  vi.mocked(services.fetchLossesByReasonReport).mockImplementation(async (query) =>
    query.from === "2026-09-10"
      ? { kind: "failed" }
      : { kind: "ok", value: lossesByReasonReport() },
  );
  await typeDate(screen, "Desde", "10092026");
  await expect.element(screen.getByText("No pudimos abrir las mermas por motivo")).toBeVisible();
  vi.mocked(services.fetchLossesByReasonReport).mockReturnValue(new Promise(() => {}));

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Motivos", { exact: true })).toBeVisible();
  expect(screen.getByRole("region").elements()).toHaveLength(0);
  expect(screen.getByText("4 pérdidas", { exact: true }).query()).toBeNull();
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.fetchLossesByReasonReport).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded).toHaveBeenCalled();
});

test("sends the person to Mi cuenta when the cloud refuses the report", async () => {
  const services = createServices();
  vi.mocked(services.fetchLossesByReasonReport).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("downloads a spreadsheet with a sheet for each reason shown, for the period the report answered", async () => {
  const downloads = spyOnDownloads();
  const screen = await renderScreen(listed());
  await expect.element(screen.getByRole("region", { name: "Mal estado" })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Descargar planilla" }));

  await expect
    .poll(() => downloads.names)
    .toEqual(["mermas-por-motivo-2026-10-01-2026-10-31.xlsx"]);
  const file = await readDownloadedXlsx(downloads.blobs[0]);
  expect(file.sheetNames).toEqual(["Resumen", "Mal estado", "Vencimiento"]);
  const summary = file.sheet(0);
  expect(summary.get("B4")?.value).toBe("4");
  expect(summary.get("B5")?.value).toBe("2");
  const spoiled = file.sheet(1);
  expect(spoiled.get("A2")?.value).toBe("Queso cremoso");
  expect(spoiled.get("C2")?.value).toBe("2.5");
  expect(spoiled.get("B3")?.value).toBe("3");
  expect(file.sheet(2).get("A2")?.value).toBe("Yogur natural");
});

test("has its download disabled while the report loads and after loading fails", async () => {
  const services = createServices();
  vi.mocked(services.fetchLossesByReasonReport).mockReturnValue(new Promise(() => {}));
  const loading = await renderScreen(services);
  await expect.element(loading.getByRole("button", { name: "Descargar planilla" })).toBeDisabled();
  await loading.unmount();

  vi.mocked(services.fetchLossesByReasonReport).mockResolvedValue({ kind: "failed" });
  const failed = await renderScreen(services);
  await expect.element(failed.getByRole("button", { name: "Reintentar" })).toBeVisible();
  await expect.element(failed.getByRole("button", { name: "Descargar planilla" })).toBeDisabled();
});
