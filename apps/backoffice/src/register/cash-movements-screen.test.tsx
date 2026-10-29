import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations, tokenRgb } from "@purosur/ui/test";
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
import { CashMovementsScreen } from "./cash-movements-screen";
import type { CashMovementsScreenServices } from "./cash-movements-services";
import {
  emptyCashMovementsReport,
  weekCashMovementsReport,
} from "./test-support/cash-movements-fixtures";

function createServices(): CashMovementsScreenServices {
  const services = { fetchCashMovements: vi.fn() };
  services.fetchCashMovements.mockResolvedValue({
    kind: "ok",
    value: weekCashMovementsReport,
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
  services: CashMovementsScreenServices;
  registerServices: ReportRegisterFilterServices;
}) {
  const [filters, setFilters] = useState(initial);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <CashMovementsScreen
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
  services: CashMovementsScreenServices,
  {
    registerServices = createReportRegisterFilterServices(),
    ...handlers
  }: Handlers & { registerServices?: ReportRegisterFilterServices } = {},
) {
  return render(
    <ControlledScreen services={services} registerServices={registerServices} {...handlers} />,
  );
}

type Screen = Awaited<ReturnType<typeof renderScreen>>;

const TITLE = "Movimientos de caja";

function movementsTable(screen: Screen) {
  return screen.getByRole("table", { name: TITLE, exact: true });
}

function emptyStateIconColor(title: Element): string {
  const icon = title.parentElement?.querySelector("svg");
  return icon ? getComputedStyle(icon).color : "";
}

test("shows the amount and the count of cash ins, cash outs and withdrawals, from the cloud", async () => {
  const screen = await renderScreen(createServices());

  await expect.element(screen.getByRole("heading", { name: TITLE, level: 1 })).toBeVisible();
  await expect.element(screen.getByText("Reportes · Caja", { exact: true })).toBeVisible();
  await expect.element(screen.getByText(/^Ingresos1 movimiento\$ 200,00$/)).toBeVisible();
  await expect.element(screen.getByText(/^Gastos2 movimientos\$ 155,50$/)).toBeVisible();
  await expect.element(screen.getByText(/^Retiros1 movimiento\$ 500,00$/)).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("writes a count of movements as a number reads in Spanish", async () => {
  const services = createServices();
  vi.mocked(services.fetchCashMovements).mockResolvedValue({
    kind: "ok",
    value: {
      ...weekCashMovementsReport,
      totals: {
        ...weekCashMovementsReport.totals,
        cash_in: { movements: 1_200, amount: 20_000 },
      },
    },
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText(/^Ingresos1\.200 movimientos/)).toBeVisible();
});

test("shows each movement with its day and time, its kind, its reason, its session and its amount", async () => {
  const screen = await renderScreen(createServices());

  const table = movementsTable(screen);
  for (const name of ["Fecha", "Tipo", "Motivo", "Sesión", "Monto"]) {
    await expect.element(table.getByRole("columnheader", { name })).toBeVisible();
  }
  const row = table.getByRole("row", { name: /Retiro a caja fuerte/ });
  await expect.element(row.getByText("06/10/2026", { exact: true })).toBeVisible();
  await expect.element(row.getByText("17:00")).toBeVisible();
  await expect.element(row.getByText("Retiro", { exact: true })).toBeVisible();
  await expect.element(row.getByText("Caja principal")).toBeVisible();
  await expect.element(row.getByText("Apertura 06/10/2026 08:00")).toBeVisible();
  await expect.element(row.getByText("$ 500,00", { exact: true })).toBeVisible();
});

test("names each kind of movement in Spanish", async () => {
  const screen = await renderScreen(createServices());

  const table = movementsTable(screen);
  await expect
    .element(table.getByRole("row", { name: /Cambio para la caja/ }).getByText("Ingreso"))
    .toBeVisible();
  await expect
    .element(table.getByRole("row", { name: /Compra de hielo/ }).getByText("Gasto"))
    .toBeVisible();
  await expect
    .element(table.getByRole("row", { name: /Retiro a caja fuerte/ }).getByText("Retiro"))
    .toBeVisible();
});

test("shows the movements in the order the cloud answered them", async () => {
  const screen = await renderScreen(createServices());
  await expect.element(movementsTable(screen).getByText("17:00")).toBeVisible();

  const reasons = movementsTable(screen)
    .getByRole("row")
    .elements()
    .map(
      (row) =>
        /Retiro a caja fuerte|Compra de hielo|Cambio para la caja|Bolsas de papel/.exec(
          row.textContent ?? "",
        )?.[0],
    )
    .filter((reason) => reason !== undefined);
  expect(reasons).toEqual([
    "Retiro a caja fuerte",
    "Compra de hielo",
    "Cambio para la caja",
    "Bolsas de papel",
  ]);
});

test("asks the cloud for no range when the URL has none, and shows the range it answered", async () => {
  const services = createServices();

  const screen = await renderScreen(services);

  await expect.poll(() => dateSegments(screen, "Desde")).toEqual(["1", "10", "2026"]);
  expect(dateSegments(screen, "Hasta")).toEqual(["7", "10", "2026"]);
  expect(services.fetchCashMovements).toHaveBeenCalledWith({});
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
    .poll(() => vi.mocked(services.fetchCashMovements).mock.lastCall)
    .toEqual([{ from: "2026-10-02", to: "2026-10-05", register_id: FRONT_REGISTER_ID }]);
});

test("asks the cloud again for the register chosen in the filters", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Compra de hielo")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  await expect
    .poll(() => vi.mocked(services.fetchCashMovements).mock.lastCall)
    .toEqual([{ register_id: FRONT_REGISTER_ID }]);
});

test("keeps the previous movements in view, marked as updating, while another register loads", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Compra de hielo")).toBeVisible();
  vi.mocked(services.fetchCashMovements).mockReturnValue(new Promise(() => {}));

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  await expect.element(movementsTable(screen)).toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByText("Compra de hielo")).toBeVisible();
});

test("shows placeholders while the report loads", async () => {
  const services = createServices();
  vi.mocked(services.fetchCashMovements).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect.element(movementsTable(screen)).toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByText("Ingresos", { exact: true })).toBeVisible();
  expect(screen.getByText("$ 200,00").query()).toBeNull();
});

test("says there are no movements in the period when there are none", async () => {
  const services = createServices();
  vi.mocked(services.fetchCashMovements).mockResolvedValue({
    kind: "ok",
    value: emptyCashMovementsReport,
  });

  const screen = await renderScreen(services);

  const empty = movementsTable(screen).getByText("No hay movimientos de caja en este período");
  await expect.element(empty).toBeVisible();
  await expect.element(screen.getByText(/^Ingresos0 movimientos\$ 0,00$/)).toBeVisible();
  expect(emptyStateIconColor(empty.element())).toBe(tokenRgb("text-accent"));
});

test("says there are none in that register when one is chosen and it has none", async () => {
  const services = createServices();
  vi.mocked(services.fetchCashMovements).mockResolvedValue({
    kind: "ok",
    value: emptyCashMovementsReport,
  });

  const screen = await renderScreen(services, {
    filters: reportFiltersSearch.parse({ register: FRONT_REGISTER_ID }),
  });

  const empty = movementsTable(screen).getByText("No hay movimientos en esta caja en este período");
  await expect.element(empty).toBeVisible();
  expect(emptyStateIconColor(empty.element())).toBe(tokenRgb("text-subtle"));
});

test("shows a failed load with a retry that loads the report again", async () => {
  const services = createServices();
  vi.mocked(services.fetchCashMovements)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: weekCashMovementsReport });
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }).first());

  await expect.element(screen.getByText("Compra de hielo")).toBeVisible();
  expect(services.fetchCashMovements).toHaveBeenCalledTimes(2);
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.fetchCashMovements).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
