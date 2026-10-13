import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { type ReportFilters, reportFiltersSearch } from "../shell/report-filters-search";
import { render } from "../shell/test-support/render-with-router";
import { dateSegments } from "../shell/test-support/report-dates";
import { BACK_REGISTER_ID, FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import {
  createReportRegisterFilterServices,
  reportRegisterFieldForTests,
  type ReportRegisterFilterServices,
} from "../shell/test-support/report-register-filter";
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

  await expect.poll(() => dateSegments(screen, "Desde")).toEqual(["1", "10", "2026"]);
  expect(dateSegments(screen, "Hasta")).toEqual(["7", "10", "2026"]);
  expect(services.fetchSalesReport).toHaveBeenCalledWith({});
});

test("asks the cloud for no range when the URL names one it would refuse, and shows the range it answered", async () => {
  const services = createServices();

  const screen = await renderScreen(services, {
    filters: { from: "2026-10-08", to: "2026-10-07", register: "ALL" },
  });

  await expect.poll(() => dateSegments(screen, "Desde")).toEqual(["1", "10", "2026"]);
  expect(dateSegments(screen, "Hasta")).toEqual(["7", "10", "2026"]);
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
  expect(dateSegments(screen, "Desde")).toEqual(["2", "10", "2026"]);
  await expect.element(screen.getByRole("button", { name: "Caja: Caja del fondo" })).toBeVisible();
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

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
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

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
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
  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
  await expect.element(screen.getByRole("option", { name: "Todas" })).toBeVisible();
  expect(screen.getByRole("option").elements()).toHaveLength(1);
});
