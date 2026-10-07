import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { type SalesByDayFilters, salesByDayFilters } from "./sales-by-day-filters";
import { SalesByDayScreen } from "./sales-by-day-screen";
import type { SalesByDayScreenServices } from "./sales-by-day-services";
import { dateSegments, typeDate } from "./test-support/report-dates";
import {
  BACK_REGISTER_ID,
  FRONT_REGISTER_ID,
  registers,
  todayReport,
  weekReport,
} from "./test-support/sales-fixtures";

function createServices(): SalesByDayScreenServices {
  const services = { fetchSalesReport: vi.fn(), fetchReportRegisters: vi.fn() };
  services.fetchSalesReport.mockResolvedValue({ kind: "ok", value: weekReport });
  services.fetchReportRegisters.mockResolvedValue({ kind: "ok", value: registers });
  return services;
}

type Handlers = {
  filters?: SalesByDayFilters;
  onFiltersChange?: (filters: SalesByDayFilters) => void;
  onSessionEnded?: () => void;
};

function ControlledScreen({
  services,
  filters: initial = salesByDayFilters.parse({}),
  onFiltersChange = () => {},
  onSessionEnded = () => {},
}: Handlers & { services: SalesByDayScreenServices }) {
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
        />
      </main>
    </FieldSizeProvider>
  );
}

function renderScreen(services: SalesByDayScreenServices, handlers: Handlers = {}) {
  return render(<ControlledScreen services={services} {...handlers} />);
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

test("asks the cloud for the range and the register the URL names", async () => {
  const services = createServices();

  const screen = await renderScreen(services, {
    filters: salesByDayFilters.parse({
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
    filters: salesByDayFilters.parse({ register: FRONT_REGISTER_ID }),
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

test("offers every register of the branch by name and reports the one chosen", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(services, { onFiltersChange });
  await expect.element(screen.getByText("02/10/2026")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
  const options = screen
    .getByRole("option")
    .elements()
    .map((option) => option.textContent);
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  expect(options).toEqual(["Todas", "Caja del fondo", "Caja principal"]);
  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({ from: "", to: "", register: FRONT_REGISTER_ID });
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
  const services = createServices();
  vi.mocked(services.fetchReportRegisters).mockResolvedValue({ kind: "failed" });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("02/10/2026")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
  await expect.element(screen.getByRole("option", { name: "Todas" })).toBeVisible();
  expect(screen.getByRole("option").elements()).toHaveLength(1);
});

test("goes back to every register when the URL names one the branch does not have", async () => {
  const onFiltersChange = vi.fn();

  await renderScreen(createServices(), {
    filters: salesByDayFilters.parse({ register: "33333333-3333-4333-8333-333333333333" }),
    onFiltersChange,
  });

  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({ from: "", to: "", register: "ALL" });
});

test("reports the range typed once both days are complete, never a half-typed year", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(services, { onFiltersChange });
  await expect.poll(() => dateSegments(screen, "Desde")).toEqual(["1", "10", "2026"]);

  await typeDate(screen, "Desde", "02102026");

  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({ from: "2026-10-02", to: "2026-10-07", register: "ALL" });
  const askedFrom = vi.mocked(services.fetchSalesReport).mock.calls.map(([query]) => query.from);
  expect(askedFrom.filter((from) => from !== undefined && from < "1000")).toEqual([]);
});

test("says the end cannot come before the start and asks the cloud for nothing", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(services, {
    filters: salesByDayFilters.parse({ from: "2026-10-02", to: "2026-10-05" }),
    onFiltersChange,
  });
  await expect.element(screen.getByText("02/10/2026")).toBeVisible();
  const readsBefore = vi.mocked(services.fetchSalesReport).mock.calls.length;

  await typeDate(screen, "Hasta", "01102026");

  await expect
    .element(screen.getByText("La fecha de fin no puede ser anterior a la de inicio."))
    .toBeVisible();
  expect(onFiltersChange).not.toHaveBeenCalled();
  expect(services.fetchSalesReport).toHaveBeenCalledTimes(readsBefore);
});

test("asks again once a range that was out of order is put right", async () => {
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(createServices(), {
    filters: salesByDayFilters.parse({ from: "2026-10-02", to: "2026-10-05" }),
    onFiltersChange,
  });
  await expect.element(screen.getByText("02/10/2026")).toBeVisible();
  await typeDate(screen, "Hasta", "01102026");

  await typeDate(screen, "Hasta", "06102026");

  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({ from: "2026-10-02", to: "2026-10-06", register: "ALL" });
  expect(
    screen.getByText("La fecha de fin no puede ser anterior a la de inicio.").query(),
  ).toBeNull();
});
