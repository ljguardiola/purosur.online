import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations, tokenRgb } from "@purosur/ui/test";
import { useState } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { type ReportPeriodFilters, reportPeriodSearch } from "../shell/report-filters-search";
import { render } from "../shell/test-support/render-with-router";
import { dateSegments, typeDate } from "../shell/test-support/report-dates";
import { PurchasesReportScreen } from "./purchases-report-screen";
import type { PurchasesReportScreenServices } from "./purchases-report-services";
import {
  emptyPurchasesReport,
  quarterPurchasesReport,
} from "./test-support/purchases-report-fixtures";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

function createServices(): PurchasesReportScreenServices {
  const services = { fetchPurchasesReport: vi.fn() };
  services.fetchPurchasesReport.mockResolvedValue({ kind: "ok", value: quarterPurchasesReport });
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
}: Handlers & { services: PurchasesReportScreenServices }) {
  const [filters, setFilters] = useState(initial);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <PurchasesReportScreen
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

function renderScreen(services: PurchasesReportScreenServices, handlers: Handlers = {}) {
  return render(<ControlledScreen services={services} {...handlers} />);
}

type Screen = Awaited<ReturnType<typeof renderScreen>>;

const TITLE = "Compras por proveedor";

function purchasesTable(screen: Screen) {
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

test("shows the total bought, the purchases and the suppliers, from the cloud", async () => {
  const screen = await renderScreen(createServices());

  await expect.element(screen.getByText(/^Total comprado\$ 2\.575,50$/)).toBeVisible();
  await expect.element(screen.getByText(/^Compras4$/)).toBeVisible();
  await expect.element(screen.getByText(/^Proveedores2$/)).toBeVisible();
});

test("writes a count of purchases as a number reads in Spanish", async () => {
  const services = createServices();
  vi.mocked(services.fetchPurchasesReport).mockResolvedValue({
    kind: "ok",
    value: {
      ...quarterPurchasesReport,
      totals: { ...quarterPurchasesReport.totals, purchases: 1_200 },
    },
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText(/^Compras1\.200$/)).toBeVisible();
});

test("shows each supplier with the purchases and the amount the cloud totalled for it", async () => {
  const screen = await renderScreen(createServices());

  const table = purchasesTable(screen);
  for (const name of ["Proveedor y mes", "Compras", "Importe"]) {
    await expect.element(table.getByRole("columnheader", { name })).toBeVisible();
  }
  const dairy = table.getByRole("row", { name: /^Lácteos del Sur/ });
  await expect.element(dairy.getByText("3", { exact: true })).toBeVisible();
  await expect.element(dairy.getByText("$ 1.750,50", { exact: true })).toBeVisible();
  const bakery = table.getByRole("row", { name: /^Panificados Norte/ });
  await expect.element(bakery.getByText("1", { exact: true })).toBeVisible();
  await expect.element(bakery.getByText("$ 825,00", { exact: true })).toBeVisible();
});

test("shows under each supplier its months, written in Spanish, with their purchases and amount", async () => {
  const screen = await renderScreen(createServices());

  const table = purchasesTable(screen);
  const september = table.getByRole("row", { name: /septiembre de 2026/ });
  await expect.element(september.getByText("1", { exact: true })).toBeVisible();
  await expect.element(september.getByText("$ 450,00", { exact: true })).toBeVisible();
  const october = table.getByRole("row", { name: /^octubre de 2026 2/ });
  await expect.element(october.getByText("$ 1.300,50", { exact: true })).toBeVisible();
});

test("lists the suppliers and their months in the order the cloud answered them", async () => {
  const screen = await renderScreen(createServices());
  await expect.element(purchasesTable(screen).getByText("septiembre de 2026")).toBeVisible();

  const labels = purchasesTable(screen)
    .getByRole("row")
    .elements()
    .map(
      (row) =>
        /Lácteos del Sur|Panificados Norte|septiembre de 2026|octubre de 2026/.exec(
          row.textContent ?? "",
        )?.[0],
    )
    .filter((label) => label !== undefined);
  expect(labels).toEqual([
    "Lácteos del Sur",
    "septiembre de 2026",
    "octubre de 2026",
    "Panificados Norte",
    "octubre de 2026",
  ]);
});

test("asks the cloud for no range when the URL has none, and shows the range it answered", async () => {
  const services = createServices();

  const screen = await renderScreen(services);

  await expect.poll(() => dateSegments(screen, "Desde")).toEqual(["1", "9", "2026"]);
  expect(dateSegments(screen, "Hasta")).toEqual(["31", "10", "2026"]);
  expect(services.fetchPurchasesReport).toHaveBeenCalledWith({});
});

test("asks the cloud for the range the URL names", async () => {
  const services = createServices();

  await renderScreen(services, {
    filters: reportPeriodSearch.parse({ from: "2026-10-02", to: "2026-10-05" }),
  });

  await expect
    .poll(() => vi.mocked(services.fetchPurchasesReport).mock.lastCall)
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
    .poll(() => vi.mocked(services.fetchPurchasesReport).mock.lastCall)
    .toEqual([{ from: "2026-10-01", to: "2026-10-07" }]);
});

test("keeps the previous report in view, marked as updating, while another range loads", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Lácteos del Sur")).toBeVisible();
  vi.mocked(services.fetchPurchasesReport).mockReturnValue(new Promise(() => {}));

  await typeDate(screen, "Desde", "01102026");
  await typeDate(screen, "Hasta", "07102026");

  await expect.element(purchasesTable(screen)).toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByText("Lácteos del Sur")).toBeVisible();
});

test("shows placeholders while the report loads", async () => {
  const services = createServices();
  vi.mocked(services.fetchPurchasesReport).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect.element(purchasesTable(screen)).toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByText("Total comprado", { exact: true })).toBeVisible();
  expect(screen.getByText("$ 2.575,50").query()).toBeNull();
});

test("says there are no purchases in the period when there are none", async () => {
  const services = createServices();
  vi.mocked(services.fetchPurchasesReport).mockResolvedValue({
    kind: "ok",
    value: emptyPurchasesReport,
  });

  const screen = await renderScreen(services);

  const empty = purchasesTable(screen).getByText("No hay compras en este período");
  await expect.element(empty).toBeVisible();
  await expect.element(screen.getByText(/^Total comprado\$ 0,00$/)).toBeVisible();
  expect(emptyStateIconColor(empty.element())).toBe(tokenRgb("text-accent"));
});

test("says there are no purchases in the chosen period as a filtered result", async () => {
  const services = createServices();
  vi.mocked(services.fetchPurchasesReport).mockResolvedValue({
    kind: "ok",
    value: emptyPurchasesReport,
  });

  const screen = await renderScreen(services, {
    filters: reportPeriodSearch.parse({ from: "2026-10-02", to: "2026-10-05" }),
  });

  const empty = purchasesTable(screen).getByText("No hay compras en este período");
  await expect.element(empty).toBeVisible();
  expect(emptyStateIconColor(empty.element())).toBe(tokenRgb("text-subtle"));
});

test("shows a failed load with a retry that loads the report again, and no figures", async () => {
  const services = createServices();
  vi.mocked(services.fetchPurchasesReport)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: quarterPurchasesReport });
  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("button", { name: "Reintentar" }).first()).toBeVisible();
  expect(screen.getByText("Total comprado", { exact: true }).query()).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }).first());

  await expect.element(screen.getByText("Lácteos del Sur")).toBeVisible();
  expect(services.fetchPurchasesReport).toHaveBeenCalledTimes(2);
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.fetchPurchasesReport).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("sends the person to Mi cuenta when the cloud refuses the report", async () => {
  const services = createServices();
  vi.mocked(services.fetchPurchasesReport).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
});
