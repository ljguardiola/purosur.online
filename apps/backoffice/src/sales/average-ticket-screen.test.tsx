import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { dateSegments } from "../shell/test-support/report-dates";
import { FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import {
  createReportRegisterFilterServices,
  type ReportRegisterFilterServices,
  reportRegisterFieldForTests,
} from "../shell/test-support/report-register-filter";
import { type AverageTicketFilters, averageTicketFilters } from "./average-ticket-filters";
import { AverageTicketScreen } from "./average-ticket-screen";
import type { AverageTicketScreenServices } from "./average-ticket-services";
import {
  averageTicketReport,
  fallingAverageTicketReport,
  noSalesAverageTicketReport,
  quietWeekAverageTicketReport,
  singleDayAverageTicketReport,
  unchangedAverageTicketReport,
} from "./test-support/sales-fixtures";

function createServices(): AverageTicketScreenServices {
  const services = { fetchAverageTicket: vi.fn() };
  services.fetchAverageTicket.mockResolvedValue({ kind: "ok", value: averageTicketReport });
  return services;
}

type Handlers = {
  filters?: AverageTicketFilters;
  onFiltersChange?: (filters: AverageTicketFilters) => void;
  onSessionEnded?: () => void;
};

function ControlledScreen({
  services,
  filters: initial = averageTicketFilters.parse({}),
  onFiltersChange = () => {},
  onSessionEnded = () => {},
  registerServices,
}: Handlers & {
  services: AverageTicketScreenServices;
  registerServices: ReportRegisterFilterServices;
}) {
  const [filters, setFilters] = useState(initial);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <AverageTicketScreen
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
  services: AverageTicketScreenServices,
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

type Screen = Awaited<ReturnType<typeof renderScreen>>;

const NEWEST_WEEK = "Del 08/10/2026 al 14/10/2026";
const MIDDLE_WEEK = "Del 01/10/2026 al 07/10/2026";
const OLDEST_WEEK = "Del 24/09/2026 al 30/09/2026";
const WEEKS = [NEWEST_WEEK, MIDDLE_WEEK, OLDEST_WEEK];

function shownWeeks(screen: Screen) {
  return screen
    .getByRole("table")
    .getByRole("row")
    .elements()
    .map((row) => WEEKS.find((week) => row.textContent?.startsWith(week)))
    .filter((week) => week !== undefined);
}

function withReport(report: typeof averageTicketReport) {
  const services = createServices();
  vi.mocked(services.fetchAverageTicket).mockResolvedValue({ kind: "ok", value: report });
  return services;
}

test("names the report, the average ticket of the period and how it compares with the one before", async () => {
  const screen = await renderScreen(createServices());

  await expect
    .element(screen.getByRole("heading", { name: "Ticket promedio", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByText("Reportes · Ventas", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Ticket promedio").first()).toBeVisible();
  await expect.element(screen.getByText("$ 250,00")).toBeVisible();
  await expect.element(screen.getByText("70 ventas")).toBeVisible();
  await expect.element(screen.getByText("Período anterior")).toBeVisible();
  await expect.element(screen.getByText("$ 240,00")).toBeVisible();
  await expect.element(screen.getByText("Del 03/09/2026 al 23/09/2026")).toBeVisible();
  await expect.element(screen.getByText("Diferencia")).toBeVisible();
  await expect.element(screen.getByText("+ 4,2 %")).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("names the period only in its range fields", async () => {
  const screen = await renderScreen(createServices());
  await expect.element(screen.getByText("Período anterior")).toBeVisible();

  expect(screen.getByText(/24\/09\/2026/).query()).toBeNull();
  expect(screen.getByText(/14\/10\/2026/).query()).toBeNull();
});

test("counts a single sale as 1 venta and names a single previous day", async () => {
  const screen = await renderScreen(withReport(singleDayAverageTicketReport));

  await expect.element(screen.getByText("1 venta", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("El 06/10/2026")).toBeVisible();
});

test("has no previous average and no difference when the previous period had no sales", async () => {
  const screen = await renderScreen(withReport(singleDayAverageTicketReport));

  await expect.element(screen.getByText("Diferencia")).toBeVisible();
  expect(screen.getByText("—", { exact: true }).elements()).toHaveLength(2);
});

test("writes a fall with a minus sign", async () => {
  const screen = await renderScreen(withReport(fallingAverageTicketReport));

  await expect.element(screen.getByText("−12,5 %")).toBeVisible();
});

test("writes no change without a sign", async () => {
  const screen = await renderScreen(withReport(unchangedAverageTicketReport));

  await expect.element(screen.getByText("0,0 %", { exact: true })).toBeVisible();
});

test("shows each week with its sales, amount and average ticket", async () => {
  const screen = await renderScreen(createServices());

  const table = screen.getByRole("table", { name: "Ticket promedio por semana" });
  for (const header of ["Semana", "Ventas", "Importe", "Ticket promedio"]) {
    await expect.element(table.getByRole("columnheader", { name: header })).toBeVisible();
  }
  const week = table.getByRole("row", { name: new RegExp(MIDDLE_WEEK) });
  await expect.element(week.getByText("10", { exact: true })).toBeVisible();
  await expect.element(week.getByText("$ 5.000,00")).toBeVisible();
  await expect.element(week.getByText("$ 500,00")).toBeVisible();
});

test("shows a week without sales with no average ticket", async () => {
  const screen = await renderScreen(withReport(quietWeekAverageTicketReport));

  const week = screen.getByRole("table").getByRole("row", { name: new RegExp(OLDEST_WEEK) });
  await expect.element(week.getByText("0", { exact: true })).toBeVisible();
  await expect.element(week.getByText("$ 0,00")).toBeVisible();
  await expect.element(week.getByText("—", { exact: true })).toBeVisible();
});

test("opens on the newest week first", async () => {
  const screen = await renderScreen(createServices());
  await expect.element(screen.getByRole("table").getByText(NEWEST_WEEK)).toBeVisible();

  expect(shownWeeks(screen)).toEqual([NEWEST_WEEK, MIDDLE_WEEK, OLDEST_WEEK]);
});

test.each([
  [{ sortBy: "week", sort: "ascending" }, [OLDEST_WEEK, MIDDLE_WEEK, NEWEST_WEEK]],
  [{ sortBy: "sales", sort: "descending" }, [NEWEST_WEEK, OLDEST_WEEK, MIDDLE_WEEK]],
  [{ sortBy: "sales", sort: "ascending" }, [MIDDLE_WEEK, OLDEST_WEEK, NEWEST_WEEK]],
  [{ sortBy: "amount", sort: "ascending" }, [OLDEST_WEEK, MIDDLE_WEEK, NEWEST_WEEK]],
  [{ sortBy: "averageTicket", sort: "ascending" }, [OLDEST_WEEK, NEWEST_WEEK, MIDDLE_WEEK]],
  [{ sortBy: "averageTicket", sort: "descending" }, [MIDDLE_WEEK, NEWEST_WEEK, OLDEST_WEEK]],
] as const)("opens on the order the URL asks for, %j", async (order, weeks) => {
  const screen = await renderScreen(createServices(), {
    filters: averageTicketFilters.parse(order),
  });
  await expect.element(screen.getByRole("table").getByText(NEWEST_WEEK)).toBeVisible();

  expect(shownWeeks(screen)).toEqual(weeks);
});

test.each([
  ["Ventas", { sortBy: "sales", sort: "descending" }],
  ["Importe", { sortBy: "amount", sort: "descending" }],
  ["Ticket promedio", { sortBy: "averageTicket", sort: "descending" }],
] as const)(
  "reports the %s column as the order when its header is pressed",
  async (header, order) => {
    const onFiltersChange = vi.fn();
    const screen = await renderScreen(createServices(), { onFiltersChange });
    await expect.element(screen.getByRole("table").getByText(NEWEST_WEEK)).toBeVisible();

    await userEvent.click(
      screen.getByRole("table").getByRole("button", { name: header, exact: true }),
    );

    await expect.poll(() => onFiltersChange.mock.lastCall?.[0]).toMatchObject(order);
  },
);

test("reports the opposite direction when the week column is pressed again", async () => {
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(createServices(), { onFiltersChange });
  await expect.element(screen.getByRole("table").getByText(NEWEST_WEEK)).toBeVisible();

  await userEvent.click(
    screen.getByRole("table").getByRole("button", { name: "Semana", exact: true }),
  );

  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toMatchObject({ sortBy: "week", sort: "ascending" });
});

test("asks the cloud with no range when the URL has none, and shows the range it answered", async () => {
  const services = createServices();

  const screen = await renderScreen(services);

  await expect.poll(() => dateSegments(screen, "Desde")).toEqual(["24", "9", "2026"]);
  expect(dateSegments(screen, "Hasta")).toEqual(["14", "10", "2026"]);
  expect(services.fetchAverageTicket).toHaveBeenCalledWith({});
});

test("asks the cloud for the range and the register the URL names", async () => {
  const services = createServices();

  await renderScreen(services, {
    filters: averageTicketFilters.parse({
      from: "2026-10-02",
      to: "2026-10-05",
      register: FRONT_REGISTER_ID,
    }),
  });

  await expect
    .poll(() => vi.mocked(services.fetchAverageTicket).mock.lastCall)
    .toEqual([{ from: "2026-10-02", to: "2026-10-05", register_id: FRONT_REGISTER_ID }]);
});

test("asks the cloud again for the register chosen in the filters", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("table").getByText(NEWEST_WEEK)).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  await expect
    .poll(() => vi.mocked(services.fetchAverageTicket).mock.lastCall)
    .toEqual([{ register_id: FRONT_REGISTER_ID }]);
});

test("keeps the previous figures and rows, marked as updating, while another register loads", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("table").getByText(NEWEST_WEEK)).toBeVisible();
  vi.mocked(services.fetchAverageTicket).mockReturnValue(new Promise(() => {}));

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  await expect
    .element(screen.getByRole("table", { name: "Ticket promedio por semana" }))
    .toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByText(NEWEST_WEEK)).toBeVisible();
  await expect.element(screen.getByText("70 ventas")).toBeVisible();
});

test("shows placeholders while the report loads", async () => {
  const services = createServices();
  vi.mocked(services.fetchAverageTicket).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("table", { name: "Ticket promedio por semana" }))
    .toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByText("Período anterior")).toBeVisible();
  await expect.element(screen.getByText("Diferencia")).toBeVisible();
  expect(screen.getByText("$ 250,00").query()).toBeNull();
});

test("says there are no sales in the period, with no average ticket, when there are none", async () => {
  const screen = await renderScreen(withReport(noSalesAverageTicketReport));

  await expect.element(screen.getByText("No hay ventas en este período")).toBeVisible();
  await expect.element(screen.getByText("0 ventas")).toBeVisible();
  expect(screen.getByText("—", { exact: true }).elements()).toHaveLength(3);
});

test("says the register has no sales in the period when one is chosen and none were made", async () => {
  const screen = await renderScreen(withReport(noSalesAverageTicketReport), {
    filters: averageTicketFilters.parse({ register: FRONT_REGISTER_ID }),
  });

  await expect
    .element(screen.getByText("No hay ventas de esta caja en este período"))
    .toBeVisible();
});

test("shows a failed load with a retry that loads the report again", async () => {
  const services = createServices();
  vi.mocked(services.fetchAverageTicket)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: averageTicketReport });
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText(NEWEST_WEEK)).toBeVisible();
  expect(services.fetchAverageTicket).toHaveBeenCalledTimes(2);
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.fetchAverageTicket).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when the report request comes back forbidden", async () => {
  const services = createServices();
  vi.mocked(services.fetchAverageTicket).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("shows every week on one page, with no pages and no export", async () => {
  const screen = await renderScreen(createServices());
  await expect.element(screen.getByRole("table").getByText(NEWEST_WEEK)).toBeVisible();

  expect(screen.getByRole("navigation", { name: /Páginas/ }).query()).toBeNull();
  expect(screen.getByRole("button", { name: "Exportar" }).query()).toBeNull();
});
