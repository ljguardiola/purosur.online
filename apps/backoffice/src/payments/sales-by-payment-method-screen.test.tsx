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
  reportRegisterFieldForTests,
  type ReportRegisterFilterServices,
} from "../shell/test-support/report-register-filter";
import {
  type SalesByPaymentMethodFilters,
  salesByPaymentMethodFilters,
} from "./sales-by-payment-method-filters";
import { SalesByPaymentMethodScreen } from "./sales-by-payment-method-screen";
import type { SalesByPaymentMethodScreenServices } from "./sales-by-payment-method-services";
import { todayPaymentsReport, weekPaymentsReport } from "./test-support/payments-report-fixtures";

function createServices(): SalesByPaymentMethodScreenServices {
  const services = { fetchSalesByPaymentMethod: vi.fn() };
  services.fetchSalesByPaymentMethod.mockResolvedValue({
    kind: "ok",
    value: weekPaymentsReport,
  });
  return services;
}

type Handlers = {
  filters?: SalesByPaymentMethodFilters;
  onFiltersChange?: (filters: SalesByPaymentMethodFilters) => void;
  onSessionEnded?: () => void;
};

function ControlledScreen({
  services,
  filters: initial = salesByPaymentMethodFilters.parse({}),
  onFiltersChange = () => {},
  onSessionEnded = () => {},
  registerServices,
}: Handlers & {
  services: SalesByPaymentMethodScreenServices;
  registerServices: ReportRegisterFilterServices;
}) {
  const [filters, setFilters] = useState(initial);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <SalesByPaymentMethodScreen
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
  services: SalesByPaymentMethodScreenServices,
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

const METHOD_NAMES = [
  "Efectivo",
  "QR de Mercado Pago",
  "Point integrada",
  "Transferencia",
  "Terminal independiente",
];

function shownMethods(screen: Screen) {
  return screen
    .getByRole("row")
    .elements()
    .map((row) => METHOD_NAMES.find((name) => row.textContent?.includes(name)))
    .filter((name) => name !== undefined);
}

test("shows the total sold, the number of sales and the average ticket of the period", async () => {
  const screen = await renderScreen(createServices());

  await expect
    .element(screen.getByRole("heading", { name: "Ventas por medio de pago", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByText("Reportes · Ventas", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Total vendido")).toBeVisible();
  await expect.element(screen.getByText("$ 14.000,00")).toBeVisible();
  await expect.element(screen.getByText("Ventas", { exact: true }).first()).toBeVisible();
  await expect.element(screen.getByText("6", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Ticket promedio")).toBeVisible();
  await expect.element(screen.getByText("$ 2.333,33")).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("names the period only in its range fields, never again under the total sold", async () => {
  const screen = await renderScreen(createServices());
  await expect.element(screen.getByText("$ 14.000,00")).toBeVisible();

  expect(screen.getByText(/01\/10\/2026/).query()).toBeNull();
  expect(screen.getByText(/07\/10\/2026/).query()).toBeNull();
});

test("shows each method with its sales, its amount and its share of the total", async () => {
  const screen = await renderScreen(createServices());

  const table = screen.getByRole("table", { name: "Ventas por medio de pago" });
  await expect.element(table.getByRole("columnheader", { name: "Medio de pago" })).toBeVisible();
  await expect.element(table.getByRole("columnheader", { name: "Parte del total" })).toBeVisible();
  const cash = table.getByRole("row", { name: /Efectivo/ });
  await expect.element(cash.getByText("$ 9.000,00")).toBeVisible();
  await expect.element(cash.getByText("4", { exact: true })).toBeVisible();
  await expect.element(cash.getByText("64 %")).toBeVisible();
  await expect.element(table.getByRole("row", { name: /QR de Mercado Pago/ })).toBeVisible();
  await expect.element(table.getByRole("row", { name: /Point integrada/ })).toBeVisible();
  await expect.element(table.getByRole("row", { name: /Transferencia/ })).toBeVisible();
});

test("shows the sales charged on the standalone terminal under its own name", async () => {
  const services = createServices();
  vi.mocked(services.fetchSalesByPaymentMethod).mockResolvedValue({
    kind: "ok",
    value: {
      ...weekPaymentsReport,
      methods: [{ method: "STANDALONE_TERMINAL", sales_count: 2, amount: 70_000 }],
      totals: { sales_count: 2, total: 70_000, average_ticket: 35_000 },
    },
  });

  const screen = await renderScreen(services);

  const standalone = screen
    .getByRole("table", { name: "Ventas por medio de pago" })
    .getByRole("row", { name: /Terminal independiente/ });
  await expect.element(standalone.getByText("$ 700,00")).toBeVisible();
  await expect.element(standalone.getByText("2", { exact: true })).toBeVisible();
  await expect.element(standalone.getByText("100 %")).toBeVisible();
});

test("opens on the method with the biggest amount first", async () => {
  const screen = await renderScreen(createServices());
  await expect.element(screen.getByText("Efectivo")).toBeVisible();

  expect(shownMethods(screen)).toEqual([
    "Efectivo",
    "QR de Mercado Pago",
    "Point integrada",
    "Transferencia",
  ]);
});

test.each([
  [
    { sortBy: "method", sort: "ascending" },
    ["Efectivo", "Point integrada", "QR de Mercado Pago", "Transferencia"],
  ],
  [
    { sortBy: "sales", sort: "ascending" },
    ["Transferencia", "Point integrada", "QR de Mercado Pago", "Efectivo"],
  ],
  [
    { sortBy: "amount", sort: "ascending" },
    ["Transferencia", "Point integrada", "QR de Mercado Pago", "Efectivo"],
  ],
] as const)("opens on the order the URL asks for, %j", async (order, methods) => {
  const screen = await renderScreen(createServices(), {
    filters: salesByPaymentMethodFilters.parse(order),
  });
  await expect.element(screen.getByText("Efectivo")).toBeVisible();

  expect(shownMethods(screen)).toEqual(methods);
});

test.each([
  ["Medio de pago", { sortBy: "method", sort: "ascending" }],
  ["Ventas", { sortBy: "sales", sort: "descending" }],
  ["Importe", { sortBy: "amount", sort: "ascending" }],
] as const)(
  "reports the %s column as the order when its header is pressed",
  async (header, order) => {
    const onFiltersChange = vi.fn();
    const screen = await renderScreen(createServices(), { onFiltersChange });
    await expect.element(screen.getByText("Efectivo")).toBeVisible();

    await userEvent.click(
      screen.getByRole("table").getByRole("button", { name: header, exact: true }),
    );

    await expect.poll(() => onFiltersChange.mock.lastCall?.[0]).toMatchObject(order);
  },
);

test("asks the cloud for no range when the URL has none, and shows the range it answered", async () => {
  const services = createServices();

  const screen = await renderScreen(services);

  await expect.poll(() => dateSegments(screen, "Desde")).toEqual(["1", "10", "2026"]);
  expect(dateSegments(screen, "Hasta")).toEqual(["7", "10", "2026"]);
  expect(services.fetchSalesByPaymentMethod).toHaveBeenCalledWith({});
});

test("asks the cloud for the range and the register the URL names", async () => {
  const services = createServices();

  await renderScreen(services, {
    filters: salesByPaymentMethodFilters.parse({
      from: "2026-10-02",
      to: "2026-10-05",
      register: FRONT_REGISTER_ID,
    }),
  });

  await expect
    .poll(() => vi.mocked(services.fetchSalesByPaymentMethod).mock.lastCall)
    .toEqual([{ from: "2026-10-02", to: "2026-10-05", register_id: FRONT_REGISTER_ID }]);
});

test("asks the cloud again for the register chosen in the filters", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Efectivo")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  await expect
    .poll(() => vi.mocked(services.fetchSalesByPaymentMethod).mock.lastCall)
    .toEqual([{ register_id: FRONT_REGISTER_ID }]);
});

test("keeps the previous methods in view, marked as updating, while another register loads", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Efectivo")).toBeVisible();
  vi.mocked(services.fetchSalesByPaymentMethod).mockReturnValue(new Promise(() => {}));

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  await expect
    .element(screen.getByRole("table", { name: "Ventas por medio de pago" }))
    .toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByText("Efectivo")).toBeVisible();
});

test("shows placeholders while the report loads", async () => {
  const services = createServices();
  vi.mocked(services.fetchSalesByPaymentMethod).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("table", { name: "Ventas por medio de pago" }))
    .toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByText("Total vendido")).toBeVisible();
  expect(screen.getByText("$ 14.000,00").query()).toBeNull();
});

test("says there are no sales in the period, with no average ticket, when there are none", async () => {
  const services = createServices();
  vi.mocked(services.fetchSalesByPaymentMethod).mockResolvedValue({
    kind: "ok",
    value: todayPaymentsReport,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No hay ventas en este período")).toBeVisible();
  await expect.element(screen.getByText("$ 0,00")).toBeVisible();
  await expect.element(screen.getByText("—", { exact: true })).toBeVisible();
});

test("says the register has no sales in the period when one is chosen and none were made", async () => {
  const services = createServices();
  vi.mocked(services.fetchSalesByPaymentMethod).mockResolvedValue({
    kind: "ok",
    value: todayPaymentsReport,
  });

  const screen = await renderScreen(services, {
    filters: salesByPaymentMethodFilters.parse({ register: FRONT_REGISTER_ID }),
  });

  await expect
    .element(screen.getByText("No hay ventas de esta caja en este período"))
    .toBeVisible();
});

test("shows a failed load with a retry that loads the report again", async () => {
  const services = createServices();
  vi.mocked(services.fetchSalesByPaymentMethod)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: weekPaymentsReport });
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Efectivo")).toBeVisible();
  expect(services.fetchSalesByPaymentMethod).toHaveBeenCalledTimes(2);
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.fetchSalesByPaymentMethod).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
