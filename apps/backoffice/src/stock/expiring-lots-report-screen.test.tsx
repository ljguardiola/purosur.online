import {
  FieldSizeProvider,
  formatCalendarDayNumeric,
  formatCents,
  formatNumber,
} from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useState } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { type ReportPeriodFilters, reportPeriodSearch } from "../shell/report-filters-search";
import { render } from "../shell/test-support/render-with-router";
import { dateSegments, typeDate } from "../shell/test-support/report-dates";
import { ExpiringLotsReportScreen } from "./expiring-lots-report-screen";
import type { ExpiringLotsReportScreenServices } from "./expiring-lots-report-services";
import {
  almondOilLot,
  breadLot,
  cheeseLot,
  expiredYogurtLot,
  expiringLotsReport,
} from "./test-support/expiring-lots-report-fixtures";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

function createServices(): ExpiringLotsReportScreenServices {
  return { fetchExpiringLotsReport: vi.fn() };
}

function listed(report = expiringLotsReport()) {
  const services = createServices();
  vi.mocked(services.fetchExpiringLotsReport).mockResolvedValue({ kind: "ok", value: report });
  return services;
}

function Harness({
  services,
  initial = reportPeriodSearch.parse({}),
  onFiltersChange = () => {},
  onSessionEnded = () => {},
}: {
  services: ExpiringLotsReportScreenServices;
  initial?: ReportPeriodFilters;
  onFiltersChange?: (filters: ReportPeriodFilters) => void;
  onSessionEnded?: () => void;
}) {
  const [filters, setFilters] = useState(initial);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <ExpiringLotsReportScreen
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
  services: ExpiringLotsReportScreenServices,
  props: Omit<Parameters<typeof Harness>[0], "services"> = {},
) {
  return render(<Harness services={services} {...props} />);
}

const TABLE = { name: "Lotes por vencer" } as const;

test("titles the report under the stock reports", async () => {
  const screen = await renderScreen(listed());

  await expect
    .element(screen.getByRole("heading", { name: "Lotes por vencer", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByText("Reportes · Stock")).toBeVisible();
});

test("states the branch's warning window and leaves the period to the date fields", async () => {
  const screen = await renderScreen(listed());

  await expect.element(screen.getByText("Ventana de aviso de la sucursal: 30 días")).toBeVisible();
  expect(screen.getByText(/^Vencen/).query()).toBeNull();
});

test("says the window in the singular", async () => {
  const screen = await renderScreen(listed(expiringLotsReport([cheeseLot], { window_days: 1 })));

  await expect.element(screen.getByText("Ventana de aviso de la sucursal: 1 día")).toBeVisible();
});

test("shows the lots, the value at cost and the lots without cost", async () => {
  const screen = await renderScreen(listed());

  await expect.element(screen.getByText("Lotes", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("2 lotes", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Valor al costo")).toBeVisible();
  await expect.element(screen.getByText(formatCents(4_377_400)).first()).toBeVisible();
  await expect.element(screen.getByText("Sin costo", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("1 lote", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("No suman al valor")).toBeVisible();
});

test("shows each lot with its product, category, lot, expiry, days, quantity and value", async () => {
  const screen = await renderScreen(listed());

  const table = screen.getByRole("table", TABLE);
  const cheese = table.getByRole("row").filter({ hasText: "Queso cremoso" });
  await expect.element(cheese.getByText("Lácteos")).toBeVisible();
  await expect.element(cheese.getByText("L-2312")).toBeVisible();
  await expect.element(cheese.getByText(formatCalendarDayNumeric("2026-10-16"))).toBeVisible();
  await expect.element(cheese.getByText("3", { exact: true })).toBeVisible();
  await expect.element(cheese.getByText("4,300 kg")).toBeVisible();
  await expect.element(cheese.getByText(formatCents(4_377_400))).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("shows a lot without a number or a known value as dashes", async () => {
  const screen = await renderScreen(listed());

  const row = screen.getByRole("table", TABLE).getByRole("row").filter({ hasText: "Pan lactal" });
  await expect.element(row).toBeVisible();
  expect(row.getByText("—").elements()).toHaveLength(2);
  await expect.element(row.getByText("12 u")).toBeVisible();
});

test("shows a lot already expired with its days counted back", async () => {
  const screen = await renderScreen(
    listed(
      expiringLotsReport([expiredYogurtLot], { period: { from: "2026-10-01", to: "2026-10-31" } }),
    ),
  );

  const row = screen
    .getByRole("table", TABLE)
    .getByRole("row")
    .filter({ hasText: "Yogur natural" });
  await expect.element(row.getByText(formatNumber(-3), { exact: true })).toBeVisible();
});

test("lists the lots in the order the cloud answers them, soonest first", async () => {
  const screen = await renderScreen(
    listed(expiringLotsReport([expiredYogurtLot, cheeseLot, breadLot])),
  );
  await expect.element(screen.getByText("Queso cremoso")).toBeVisible();

  const names = screen
    .getByRole("table", TABLE)
    .getByRole("row")
    .elements()
    .map((row) =>
      ["Yogur natural", "Queso cremoso", "Pan lactal"].find((name) =>
        row.textContent?.includes(name),
      ),
    )
    .filter((name) => name !== undefined);
  expect(names).toEqual(["Yogur natural", "Queso cremoso", "Pan lactal"]);
});

test("offers no register filter and no export", async () => {
  const screen = await renderScreen(listed());
  await expect.element(screen.getByText("Queso cremoso")).toBeVisible();

  expect(screen.getByText("Caja", { exact: false }).query()).toBeNull();
  expect(screen.getByRole("button", { name: /Exportar/ }).query()).toBeNull();
});

test("shows the period the cloud answered while the URL names none", async () => {
  const screen = await renderScreen(listed());

  await expect.poll(() => dateSegments(screen, "Desde")).toEqual(["13", "10", "2026"]);
  expect(dateSegments(screen, "Hasta")).toEqual(["12", "11", "2026"]);
});

test("asks for the branch's window when the URL names no period", async () => {
  const services = listed();

  await renderScreen(services);

  await expect.poll(() => services.fetchExpiringLotsReport).toHaveBeenCalledWith({});
});

test("asks for the period the URL carries", async () => {
  const services = listed();

  await renderScreen(services, {
    initial: reportPeriodSearch.parse({ from: "2026-12-01", to: "2026-12-31" }),
  });

  await expect
    .poll(() => services.fetchExpiringLotsReport)
    .toHaveBeenCalledWith({ from: "2026-12-01", to: "2026-12-31" });
});

test("reports the period typed once both days are complete", async () => {
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(listed(), { onFiltersChange });
  await expect.poll(() => dateSegments(screen, "Desde")).toEqual(["13", "10", "2026"]);

  await typeDate(screen, "Desde", "01112026");

  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({ from: "2026-11-01", to: "2026-11-12" });
});

test("keeps showing the report while the next period loads", async () => {
  const services = listed();
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Queso cremoso")).toBeVisible();
  vi.mocked(services.fetchExpiringLotsReport).mockReturnValue(new Promise(() => {}));

  await typeDate(screen, "Desde", "01112026");

  await expect
    .poll(() => services.fetchExpiringLotsReport)
    .toHaveBeenLastCalledWith({ from: "2026-11-01", to: "2026-11-12" });
  await expect.element(screen.getByText("Queso cremoso")).toBeVisible();
  await expect.element(screen.getByRole("table", TABLE)).toHaveAttribute("aria-busy", "true");
});

test("drops the previous report's window when the next period fails to load", async () => {
  const services = listed();
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Ventana de aviso de la sucursal: 30 días")).toBeVisible();
  vi.mocked(services.fetchExpiringLotsReport).mockResolvedValue({ kind: "failed" });

  await typeDate(screen, "Desde", "01112026");

  await expect.element(screen.getByText("No pudimos abrir los lotes por vencer")).toBeVisible();
  expect(screen.getByText("Ventana de aviso de la sucursal", { exact: false }).query()).toBeNull();
});

test("shows the screen loading while the report is on its way", async () => {
  const services = createServices();
  vi.mocked(services.fetchExpiringLotsReport).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Valor al costo")).toBeVisible();
  expect(screen.getByText("Ventana de aviso de la sucursal", { exact: false }).query()).toBeNull();
  await expect.element(screen.getByRole("table", TABLE)).toHaveAttribute("aria-busy", "true");
});

test("says no lot expires in the period when the report is empty", async () => {
  const screen = await renderScreen(listed(expiringLotsReport([])));

  await expect.element(screen.getByText("No hay lotes que venzan en este período")).toBeVisible();
  await expect.element(screen.getByText("0 lotes").first()).toBeVisible();
});

test("shows a failed load with a retry that loads the report again, and no figures", async () => {
  const services = createServices();
  vi.mocked(services.fetchExpiringLotsReport)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: expiringLotsReport([cheeseLot]) });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No pudimos abrir los lotes por vencer")).toBeVisible();
  expect(screen.getByText("Valor al costo").query()).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Queso cremoso")).toBeVisible();
  expect(services.fetchExpiringLotsReport).toHaveBeenCalledTimes(2);
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.fetchExpiringLotsReport).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded).toHaveBeenCalled();
});

test("shows each lot's product with its brand and net content", async () => {
  const screen = await renderScreen(listed(expiringLotsReport([almondOilLot])));

  const table = screen.getByRole("table", TABLE);
  await expect.element(table.getByText("Aceite de Almendras Vitora 30 ml")).toBeVisible();
});
