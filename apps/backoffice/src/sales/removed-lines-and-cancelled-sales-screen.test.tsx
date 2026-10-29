import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { type ReportFilters, reportFiltersSearch } from "../shell/report-filters-search";
import { render } from "../shell/test-support/render-with-router";
import { dateSegments } from "../shell/test-support/report-dates";
import { FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import {
  createReportRegisterFilterServices,
  type ReportRegisterFilterServices,
  reportRegisterFieldForTests,
} from "../shell/test-support/report-register-filter";
import { RemovedLinesAndCancelledSalesScreen } from "./removed-lines-and-cancelled-sales-screen";
import type { RemovedLinesAndCancelledSalesScreenServices } from "./removed-lines-and-cancelled-sales-services";
import {
  nothingRemovedOrCancelledReport,
  removedLinesAndCancelledSalesReport,
} from "./test-support/removed-lines-and-cancelled-sales-fixtures";

function createServices(): RemovedLinesAndCancelledSalesScreenServices {
  const services = { fetchRemovedLinesAndCancelledSales: vi.fn() };
  services.fetchRemovedLinesAndCancelledSales.mockResolvedValue({
    kind: "ok",
    value: removedLinesAndCancelledSalesReport,
  });
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
  services: RemovedLinesAndCancelledSalesScreenServices;
  registerServices: ReportRegisterFilterServices;
}) {
  const [filters, setFilters] = useState(initial);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <RemovedLinesAndCancelledSalesScreen
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
  services: RemovedLinesAndCancelledSalesScreenServices,
  {
    registerServices = createReportRegisterFilterServices(),
    ...handlers
  }: Handlers & { registerServices?: ReportRegisterFilterServices } = {},
) {
  return render(
    <ControlledScreen services={services} registerServices={registerServices} {...handlers} />,
  );
}

test("names the report and its totals", async () => {
  const screen = await renderScreen(createServices());

  await expect
    .element(screen.getByRole("heading", { name: "Líneas quitadas y ventas canceladas", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByText("Reportes · Ventas", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Líneas quitadas", { exact: true }).first()).toBeVisible();
  await expect.element(screen.getByText("7 u · 1,750 kg")).toBeVisible();
  await expect.element(screen.getByText("$ 15.900,00")).toBeVisible();
  await expect
    .element(screen.getByText("Ventas canceladas", { exact: true }).first())
    .toBeVisible();
  await expect.element(screen.getByText("8 u · 2,000 kg")).toBeVisible();
  await expect.element(screen.getByText("$ 12.300,50")).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("shows the cashiers under their own heading, before the sessions", async () => {
  const screen = await renderScreen(createServices());

  const headings = screen.getByRole("heading", { level: 2 });
  await expect.element(headings.first()).toBeVisible();
  expect(headings.elements().map((heading) => heading.textContent)).toEqual([
    "Por cajero",
    "Por sesión",
  ]);
});

test("shows each cashier with the removed lines and the cancelled sales, as the cloud ordered them", async () => {
  const screen = await renderScreen(createServices());

  const table = screen.getByRole("table", {
    name: "Líneas quitadas y ventas canceladas por cajero",
  });
  for (const header of [
    "Cajero",
    "Líneas quitadas",
    "Cantidad quitada",
    "Importe quitado",
    "Ventas canceladas",
    "Cantidad cancelada",
    "Importe cancelado",
  ]) {
    await expect.element(table.getByRole("columnheader", { name: header })).toBeVisible();
  }
  const beto = table.getByRole("row", { name: /Beto/ });
  await expect.element(beto.getByText("4", { exact: true })).toBeVisible();
  await expect.element(beto.getByText("7 u · 1,250 kg")).toBeVisible();
  await expect.element(beto.getByText("$ 15.000,00")).toBeVisible();
  await expect.element(beto.getByText("2", { exact: true })).toBeVisible();
  await expect.element(beto.getByText("5 u", { exact: true })).toBeVisible();
  await expect.element(beto.getByText("$ 8.200,50")).toBeVisible();
  const ana = table.getByRole("row", { name: /Ana/ });
  await expect.element(ana.getByText("3 u · 2,000 kg")).toBeVisible();
  await expect.element(ana.getByText("$ 4.100,00")).toBeVisible();
  const names = table
    .getByRole("row")
    .elements()
    .map((row) => ["Beto", "Sin identificar", "Ana"].find((n) => row.textContent?.startsWith(n)))
    .filter((name) => name !== undefined);
  expect(names).toEqual(["Beto", "Sin identificar", "Ana"]);
});

test("shows a cashier who removed nothing with zero units", async () => {
  const screen = await renderScreen(createServices());

  const ana = screen
    .getByRole("table", { name: "Líneas quitadas y ventas canceladas por cajero" })
    .getByRole("row", { name: /Ana/ });
  await expect.element(ana.getByText("0 u", { exact: true })).toBeVisible();
  await expect.element(ana.getByText("$ 0,00")).toBeVisible();
});

test("shows each session with its register, its opening, and its figures", async () => {
  const screen = await renderScreen(createServices());

  const table = screen.getByRole("table", {
    name: "Líneas quitadas y ventas canceladas por sesión",
  });
  for (const header of ["Caja", "Apertura", "Líneas quitadas", "Importe cancelado"]) {
    await expect.element(table.getByRole("columnheader", { name: header })).toBeVisible();
  }
  const first = table.getByRole("row", { name: /Caja principal/ });
  await expect.element(first.getByText("06/10/2026")).toBeVisible();
  await expect.element(first.getByText("08:30")).toBeVisible();
  await expect.element(first.getByText("6 u", { exact: true })).toBeVisible();
  await expect.element(first.getByText("$ 11.000,00")).toBeVisible();
  const second = table.getByRole("row", { name: /Caja del fondo/ });
  await expect.element(second.getByText("05/10/2026")).toBeVisible();
  await expect.element(second.getByText("18:05")).toBeVisible();
  await expect.element(second.getByText("1 u · 1,750 kg")).toBeVisible();
});

test("calls a cashier no user matches Sin identificar", async () => {
  const screen = await renderScreen(createServices());

  await expect
    .element(
      screen
        .getByRole("table")
        .first()
        .getByRole("row", { name: /Sin identificar/ }),
    )
    .toBeVisible();
});

test("asks the cloud with no range when the URL has none, and shows the range it answered", async () => {
  const services = createServices();

  const screen = await renderScreen(services);

  await expect.poll(() => dateSegments(screen, "Desde")).toEqual(["1", "10", "2026"]);
  expect(dateSegments(screen, "Hasta")).toEqual(["7", "10", "2026"]);
  expect(services.fetchRemovedLinesAndCancelledSales).toHaveBeenCalledWith({});
});

test("asks the cloud for the range and the register the URL names", async () => {
  const services = createServices();

  await renderScreen(services, {
    filters: reportFiltersSearch.parse({
      from: "2026-10-02",
      to: "2026-10-05",
      register: FRONT_REGISTER_ID,
    }),
  });

  await expect
    .poll(() => vi.mocked(services.fetchRemovedLinesAndCancelledSales).mock.lastCall)
    .toEqual([{ from: "2026-10-02", to: "2026-10-05", register_id: FRONT_REGISTER_ID }]);
});

test("asks the cloud again for the register chosen in the filters", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("table").first().getByText("Beto")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  await expect
    .poll(() => vi.mocked(services.fetchRemovedLinesAndCancelledSales).mock.lastCall)
    .toEqual([{ register_id: FRONT_REGISTER_ID }]);
});

test("keeps the previous rows, marked as updating, while another register loads", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("table").first().getByText("Beto")).toBeVisible();
  vi.mocked(services.fetchRemovedLinesAndCancelledSales).mockReturnValue(new Promise(() => {}));

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  await expect
    .element(screen.getByRole("table", { name: "Líneas quitadas y ventas canceladas por cajero" }))
    .toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByRole("table").first().getByText("Beto")).toBeVisible();
  await expect.element(screen.getByText("$ 15.900,00")).toBeVisible();
});

test("shows placeholders while the report loads", async () => {
  const services = createServices();
  vi.mocked(services.fetchRemovedLinesAndCancelledSales).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  for (const name of [
    "Líneas quitadas y ventas canceladas por cajero",
    "Líneas quitadas y ventas canceladas por sesión",
  ]) {
    await expect.element(screen.getByRole("table", { name })).toHaveAttribute("aria-busy", "true");
  }
  await expect.element(screen.getByText("Importe quitado", { exact: true })).toBeVisible();
  expect(screen.getByText("$ 15.900,00").query()).toBeNull();
});

test("says nothing was removed or cancelled in the period, with no table, when there is none", async () => {
  const services = createServices();
  vi.mocked(services.fetchRemovedLinesAndCancelledSales).mockResolvedValue({
    kind: "ok",
    value: nothingRemovedOrCancelledReport,
  });

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByText("No hay líneas quitadas ni ventas canceladas en este período"))
    .toBeVisible();
  expect(screen.getByRole("table").query()).toBeNull();
});

test("says the register had none in the period when one is chosen and none were", async () => {
  const services = createServices();
  vi.mocked(services.fetchRemovedLinesAndCancelledSales).mockResolvedValue({
    kind: "ok",
    value: nothingRemovedOrCancelledReport,
  });

  const screen = await renderScreen(services, {
    filters: reportFiltersSearch.parse({ register: FRONT_REGISTER_ID }),
  });

  await expect
    .element(
      screen.getByText("No hay líneas quitadas ni ventas canceladas en esta caja en este período"),
    )
    .toBeVisible();
  expect(screen.getByRole("table").query()).toBeNull();
});

test("shows a failed load with a retry that loads the report again", async () => {
  const services = createServices();
  vi.mocked(services.fetchRemovedLinesAndCancelledSales)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: removedLinesAndCancelledSalesReport });
  const screen = await renderScreen(services);

  await expect
    .element(screen.getByText("No pudimos abrir el reporte de líneas quitadas y ventas canceladas"))
    .toBeVisible();
  expect(screen.getByRole("table").query()).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByRole("table").first().getByText("Beto")).toBeVisible();
  expect(services.fetchRemovedLinesAndCancelledSales).toHaveBeenCalledTimes(2);
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.fetchRemovedLinesAndCancelledSales).mockResolvedValue({
    kind: "unauthenticated",
  });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when the report request comes back forbidden", async () => {
  const services = createServices();
  vi.mocked(services.fetchRemovedLinesAndCancelledSales).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
});
