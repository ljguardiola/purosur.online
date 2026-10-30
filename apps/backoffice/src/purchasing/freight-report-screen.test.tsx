import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations, tokenRgb } from "@purosur/ui/test";
import { useState } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { type ReportPeriodFilters, reportPeriodSearch } from "../shell/report-filters-search";
import { render } from "../shell/test-support/render-with-router";
import { dateSegments, typeDate } from "../shell/test-support/report-dates";
import { FreightReportScreen } from "./freight-report-screen";
import type { FreightReportScreenServices } from "./freight-report-services";
import { emptyFreightReport, quarterFreightReport } from "./test-support/freight-report-fixtures";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

function createServices(): FreightReportScreenServices {
  const services = { fetchFreightReport: vi.fn() };
  services.fetchFreightReport.mockResolvedValue({ kind: "ok", value: quarterFreightReport });
  return services;
}

type Handlers = {
  filters?: ReportPeriodFilters;
  onFiltersChange?: (filters: ReportPeriodFilters) => void;
  onSessionEnded?: () => void;
};

function ControlledScreen({
  services,
  filters: initial = reportPeriodSearch.parse({}),
  onFiltersChange = () => {},
  onSessionEnded = () => {},
}: Handlers & { services: FreightReportScreenServices }) {
  const [filters, setFilters] = useState(initial);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <FreightReportScreen
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

function renderScreen(services: FreightReportScreenServices, handlers: Handlers = {}) {
  return render(<ControlledScreen services={services} {...handlers} />);
}

type Screen = Awaited<ReturnType<typeof renderScreen>>;

const TITLE = "Flete por período";

function freightTable(screen: Screen) {
  return screen.getByRole("table", { name: TITLE, exact: true });
}

function emptyStateIconColor(title: Element): string {
  const icon = title.parentElement?.querySelector("svg");
  return icon ? getComputedStyle(icon).color : "";
}

test("titles the report under the purchases reports", async () => {
  const screen = await renderScreen(createServices());

  await expect.element(screen.getByRole("heading", { name: TITLE, level: 1 })).toBeVisible();
  await expect.element(screen.getByText("Reportes · Compras", { exact: true })).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("shows the total freight and the freights, from the cloud", async () => {
  const screen = await renderScreen(createServices());

  await expect.element(screen.getByText(/^Total de fletes\$ 1\.750,50$/)).toBeVisible();
  await expect.element(screen.getByText(/^Fletes3$/)).toBeVisible();
});

test("writes a count of freights as a number reads in Spanish", async () => {
  const services = createServices();
  vi.mocked(services.fetchFreightReport).mockResolvedValue({
    kind: "ok",
    value: {
      ...quarterFreightReport,
      totals: { ...quarterFreightReport.totals, freights: 1_200 },
    },
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText(/^Fletes1\.200$/)).toBeVisible();
});

test("shows each month, written in Spanish, with the freights and the amount the cloud totalled for it", async () => {
  const screen = await renderScreen(createServices());

  const table = freightTable(screen);
  for (const name of ["Mes", "Fletes", "Monto"]) {
    await expect.element(table.getByRole("columnheader", { name })).toBeVisible();
  }
  const september = table.getByRole("row", { name: /^septiembre de 2026/ });
  await expect.element(september.getByText("1", { exact: true })).toBeVisible();
  await expect.element(september.getByText("$ 450,00", { exact: true })).toBeVisible();
  const october = table.getByRole("row", { name: /^octubre de 2026/ });
  await expect.element(october.getByText("2", { exact: true })).toBeVisible();
  await expect.element(october.getByText("$ 1.300,50", { exact: true })).toBeVisible();
});

test("lists the months in the order the cloud answered them", async () => {
  const screen = await renderScreen(createServices());
  await expect.element(freightTable(screen).getByText("septiembre de 2026")).toBeVisible();

  const labels = freightTable(screen)
    .getByRole("row")
    .elements()
    .map((row) => /septiembre de 2026|octubre de 2026/.exec(row.textContent ?? "")?.[0])
    .filter((label) => label !== undefined);
  expect(labels).toEqual(["septiembre de 2026", "octubre de 2026"]);
});

test("asks the cloud for no range when the URL has none, and shows the range it answered", async () => {
  const services = createServices();

  const screen = await renderScreen(services);

  await expect.poll(() => dateSegments(screen, "Desde")).toEqual(["1", "9", "2026"]);
  expect(dateSegments(screen, "Hasta")).toEqual(["31", "10", "2026"]);
  expect(services.fetchFreightReport).toHaveBeenCalledWith({});
});

test("asks the cloud for the range the URL names", async () => {
  const services = createServices();

  await renderScreen(services, {
    filters: reportPeriodSearch.parse({ from: "2026-10-02", to: "2026-10-05" }),
  });

  await expect
    .poll(() => vi.mocked(services.fetchFreightReport).mock.lastCall)
    .toEqual([{ from: "2026-10-02", to: "2026-10-05" }]);
});

test("asks the cloud again for the range typed in the filters", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(services, { onFiltersChange });
  await expect.element(screen.getByText("octubre de 2026").first()).toBeVisible();

  await typeDate(screen, "Desde", "01102026");
  await typeDate(screen, "Hasta", "07102026");

  await expect
    .poll(() => vi.mocked(services.fetchFreightReport).mock.lastCall)
    .toEqual([{ from: "2026-10-01", to: "2026-10-07" }]);
});

test("keeps the previous report in view, marked as updating, while another range loads", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("septiembre de 2026")).toBeVisible();
  vi.mocked(services.fetchFreightReport).mockReturnValue(new Promise(() => {}));

  await typeDate(screen, "Desde", "01102026");
  await typeDate(screen, "Hasta", "07102026");

  await expect.element(freightTable(screen)).toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByText("septiembre de 2026")).toBeVisible();
});

test("shows placeholders while the report loads", async () => {
  const services = createServices();
  vi.mocked(services.fetchFreightReport).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect.element(freightTable(screen)).toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByText("Total de fletes", { exact: true })).toBeVisible();
  expect(screen.getByText("$ 1.750,50").query()).toBeNull();
});

test("says there is no freight in the period when there is none", async () => {
  const services = createServices();
  vi.mocked(services.fetchFreightReport).mockResolvedValue({
    kind: "ok",
    value: emptyFreightReport,
  });

  const screen = await renderScreen(services);

  const empty = freightTable(screen).getByText("No hay fletes en este período");
  await expect.element(empty).toBeVisible();
  await expect.element(screen.getByText(/^Total de fletes\$ 0,00$/)).toBeVisible();
  expect(emptyStateIconColor(empty.element())).toBe(tokenRgb("text-accent"));
});

test("says there is no freight in the chosen period as a filtered result", async () => {
  const services = createServices();
  vi.mocked(services.fetchFreightReport).mockResolvedValue({
    kind: "ok",
    value: emptyFreightReport,
  });

  const screen = await renderScreen(services, {
    filters: reportPeriodSearch.parse({ from: "2026-10-02", to: "2026-10-05" }),
  });

  const empty = freightTable(screen).getByText("No hay fletes en este período");
  await expect.element(empty).toBeVisible();
  expect(emptyStateIconColor(empty.element())).toBe(tokenRgb("text-subtle"));
});

test("shows a failed load with a retry that loads the report again, and no figures", async () => {
  const services = createServices();
  vi.mocked(services.fetchFreightReport)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: quarterFreightReport });
  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("button", { name: "Reintentar" }).first()).toBeVisible();
  expect(screen.getByText("Total de fletes", { exact: true }).query()).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }).first());

  await expect.element(screen.getByText("septiembre de 2026")).toBeVisible();
  expect(services.fetchFreightReport).toHaveBeenCalledTimes(2);
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.fetchFreightReport).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("sends the person to Mi cuenta when the cloud refuses the report", async () => {
  const services = createServices();
  vi.mocked(services.fetchFreightReport).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
});
