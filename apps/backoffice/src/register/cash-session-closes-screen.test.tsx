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
import { CashSessionClosesScreen } from "./cash-session-closes-screen";
import type { CashSessionClosesScreenServices } from "./cash-session-closes-services";
import {
  closeByAnaClosedByBeto,
  closeByTomas,
  emptyCashSessionClosesReport,
  weekCashSessionClosesReport,
} from "./test-support/cash-session-closes-fixtures";

function createServices(): CashSessionClosesScreenServices {
  const services = { fetchCashSessionCloses: vi.fn() };
  services.fetchCashSessionCloses.mockResolvedValue({
    kind: "ok",
    value: weekCashSessionClosesReport,
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
  services: CashSessionClosesScreenServices;
  registerServices: ReportRegisterFilterServices;
}) {
  const [filters, setFilters] = useState(initial);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <CashSessionClosesScreen
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
  services: CashSessionClosesScreenServices,
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

const TITLE = "Cierres de sesión";

function closesTable(screen: Screen) {
  return screen.getByRole("table", { name: TITLE, exact: true });
}

test("shows how many sessions closed, their net difference and how many had one, from the cloud", async () => {
  const screen = await renderScreen(createServices());

  await expect.element(screen.getByRole("heading", { name: TITLE, level: 1 })).toBeVisible();
  await expect.element(screen.getByText("Reportes · Caja", { exact: true })).toBeVisible();
  await expect.element(screen.getByText(/^Sesiones cerradas3$/)).toBeVisible();
  await expect.element(screen.getByText(/^Diferencia total− \$ 420,00$/)).toBeVisible();
  await expect
    .element(screen.getByText(/^Con diferenciaTomás Ruiz 1 · Lucía Pérez 12 de 3$/))
    .toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("names a cashier with a difference the cloud could not identify", async () => {
  const services = createServices();
  vi.mocked(services.fetchCashSessionCloses).mockResolvedValue({
    kind: "ok",
    value: {
      ...weekCashSessionClosesReport,
      totals: {
        ...weekCashSessionClosesReport.totals,
        cashiers: [{ cashier_id: "gone", cashier_name: null, sessions: 2 }],
      },
    },
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText(/Sin identificar 2/)).toBeVisible();
});

test("lists no cashier when no session had a difference", async () => {
  const services = createServices();
  vi.mocked(services.fetchCashSessionCloses).mockResolvedValue({
    kind: "ok",
    value: {
      ...weekCashSessionClosesReport,
      totals: { sessions: 1, net_difference: 0, with_difference: 0, cashiers: [] },
      sessions: [{ ...closeByAnaClosedByBeto, closed_by_id: closeByAnaClosedByBeto.cashier_id }],
    },
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText(/^Con diferencia0 de 1$/)).toBeVisible();
  await expect.element(screen.getByText(/^Diferencia total\$ 0,00$/)).toBeVisible();
});

test("shows each session with its day and time, its register, its cashier and its cash", async () => {
  const screen = await renderScreen(createServices());

  const table = closesTable(screen);
  for (const name of ["Fecha", "Caja", "Cajero", "Esperado", "Contado", "Diferencia"]) {
    await expect.element(table.getByRole("columnheader", { name })).toBeVisible();
  }
  const first = table.getByRole("row", { name: /Tomás Ruiz/ });
  await expect.element(first.getByText("06/10/2026")).toBeVisible();
  await expect.element(first.getByText("17:00")).toBeVisible();
  await expect.element(first.getByText("Caja principal")).toBeVisible();
  await expect.element(first.getByText("$ 1.000,00")).toBeVisible();
  await expect.element(first.getByText("$ 500,00", { exact: true })).toBeVisible();
  await expect.element(first.getByText("− $ 500,00")).toBeVisible();
});

test("shows the sessions in the order the cloud answered them", async () => {
  const screen = await renderScreen(createServices());
  await expect.element(closesTable(screen).getByText("17:00")).toBeVisible();

  const times = closesTable(screen)
    .getByRole("row")
    .elements()
    .map((row) => /\d{2}:\d{2}/.exec(row.textContent ?? "")?.[0])
    .filter((time) => time !== undefined);
  expect(times).toEqual(["17:00", "11:30", "18:15"]);
});

test("says who closed the session only when it was not the person who opened it", async () => {
  const screen = await renderScreen(createServices());

  const table = closesTable(screen);
  await expect
    .element(table.getByRole("row", { name: /Ana/ }).getByText("Cerró: Beto"))
    .toBeVisible();
  expect(table.getByText(/Cerró: Tomás/).query()).toBeNull();
  expect(table.getByText(/Cerró: Lucía/).query()).toBeNull();
});

test("names a cashier the cloud could not identify and a closer that is unknown", async () => {
  const services = createServices();
  vi.mocked(services.fetchCashSessionCloses).mockResolvedValue({
    kind: "ok",
    value: {
      ...weekCashSessionClosesReport,
      sessions: [
        {
          ...closeByTomas,
          cashier_name: null,
          closed_by_id: "someone-else",
          closed_by_name: null,
        },
      ],
    },
  });

  const screen = await renderScreen(services);

  const row = closesTable(screen).getByRole("row", { name: /Sin identificar/ });
  await expect.element(row.getByText("Cerró: Sin identificar")).toBeVisible();
});

test("says an exact close has no difference and colors the others by their sign", async () => {
  const screen = await renderScreen(createServices());

  const table = closesTable(screen);
  const exact = table.getByText("Sin diferencia");
  await expect.element(exact).toBeVisible();
  const short = table.getByText("− $ 500,00").element() as HTMLElement;
  const over = table.getByText("$ 80,00", { exact: true }).last().element() as HTMLElement;
  expect(getComputedStyle(short).color).toBe(tokenRgb("error-strong"));
  expect(getComputedStyle(over).color).toBe(tokenRgb("success-strong"));
});

test("asks the cloud for no range when the URL has none, and shows the range it answered", async () => {
  const services = createServices();

  const screen = await renderScreen(services);

  await expect.poll(() => dateSegments(screen, "Desde")).toEqual(["1", "10", "2026"]);
  expect(dateSegments(screen, "Hasta")).toEqual(["7", "10", "2026"]);
  expect(services.fetchCashSessionCloses).toHaveBeenCalledWith({});
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
    .poll(() => vi.mocked(services.fetchCashSessionCloses).mock.lastCall)
    .toEqual([{ from: "2026-10-02", to: "2026-10-05", register_id: FRONT_REGISTER_ID }]);
});

test("asks the cloud again for the register chosen in the filters", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Cerró: Beto")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  await expect
    .poll(() => vi.mocked(services.fetchCashSessionCloses).mock.lastCall)
    .toEqual([{ register_id: FRONT_REGISTER_ID }]);
});

test("keeps the previous sessions in view, marked as updating, while another register loads", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Cerró: Beto")).toBeVisible();
  vi.mocked(services.fetchCashSessionCloses).mockReturnValue(new Promise(() => {}));

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  await expect.element(closesTable(screen)).toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByText("Cerró: Beto")).toBeVisible();
});

test("shows placeholders while the report loads", async () => {
  const services = createServices();
  vi.mocked(services.fetchCashSessionCloses).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect.element(closesTable(screen)).toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByText("Sesiones cerradas", { exact: true })).toBeVisible();
  expect(screen.getByText("− $ 420,00").query()).toBeNull();
});

test("says there are no closed sessions in the period when there are none", async () => {
  const services = createServices();
  vi.mocked(services.fetchCashSessionCloses).mockResolvedValue({
    kind: "ok",
    value: emptyCashSessionClosesReport,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No hay sesiones cerradas en este período")).toBeVisible();
  await expect.element(screen.getByText(/^Sesiones cerradas0$/)).toBeVisible();
  expect(screen.getByRole("table").query()).toBeNull();
});

test("says there are none in the period when a register is chosen and none closed", async () => {
  const services = createServices();
  vi.mocked(services.fetchCashSessionCloses).mockResolvedValue({
    kind: "ok",
    value: emptyCashSessionClosesReport,
  });

  const screen = await renderScreen(services, {
    filters: reportFiltersSearch.parse({ register: FRONT_REGISTER_ID }),
  });

  await expect.element(screen.getByText("No hay sesiones cerradas en este período")).toBeVisible();
});

test("shows a failed load with a retry that loads the report again", async () => {
  const services = createServices();
  vi.mocked(services.fetchCashSessionCloses)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: weekCashSessionClosesReport });
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }).first());

  await expect.element(screen.getByText("Cerró: Beto")).toBeVisible();
  expect(services.fetchCashSessionCloses).toHaveBeenCalledTimes(2);
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.fetchCashSessionCloses).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
