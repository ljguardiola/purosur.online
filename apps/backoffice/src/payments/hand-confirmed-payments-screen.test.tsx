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
import {
  type HandConfirmedPaymentsFilters,
  handConfirmedPaymentsFilters,
} from "./hand-confirmed-payments-filters";
import { HandConfirmedPaymentsScreen } from "./hand-confirmed-payments-screen";
import type { HandConfirmedPaymentsScreenServices } from "./hand-confirmed-payments-services";
import {
  emptyHandConfirmedReport,
  weekHandConfirmedReport,
} from "./test-support/payments-report-fixtures";

function createServices(): HandConfirmedPaymentsScreenServices {
  const services = { fetchHandConfirmedPayments: vi.fn() };
  services.fetchHandConfirmedPayments.mockResolvedValue({
    kind: "ok",
    value: weekHandConfirmedReport,
  });
  return services;
}

type Handlers = {
  filters?: HandConfirmedPaymentsFilters;
  onFiltersChange?: (filters: HandConfirmedPaymentsFilters) => void;
  onSessionEnded?: () => void;
};

function ControlledScreen({
  services,
  filters: initial = handConfirmedPaymentsFilters.parse({}),
  onFiltersChange = () => {},
  onSessionEnded = () => {},
  registerServices,
}: Handlers & {
  services: HandConfirmedPaymentsScreenServices;
  registerServices: ReportRegisterFilterServices;
}) {
  const [filters, setFilters] = useState(initial);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <HandConfirmedPaymentsScreen
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
  services: HandConfirmedPaymentsScreenServices,
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

const PAYMENTS = "Pagos confirmados a mano";
const BY_CASHIER = "Pagos confirmados a mano por cajero";

function paymentsTable(screen: Screen) {
  return screen.getByRole("table", { name: PAYMENTS, exact: true });
}

function cashiersTable(screen: Screen) {
  return screen.getByRole("table", { name: BY_CASHIER, exact: true });
}

test("shows the count and the amount of the payments, and of each method, from the cloud", async () => {
  const screen = await renderScreen(createServices());

  await expect.element(screen.getByRole("heading", { name: PAYMENTS, level: 1 })).toBeVisible();
  await expect.element(screen.getByText("Reportes · Caja", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Pagos", { exact: true }).first()).toBeVisible();
  await expect.element(screen.getByText("3", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("$ 1.900,00")).toBeVisible();
  await expect.element(screen.getByText("Transferencias", { exact: true }).first()).toBeVisible();
  await expect.element(screen.getByText("$ 1.500,00")).toBeVisible();
  await expect.element(screen.getByText("$ 400,00").first()).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("shows each cashier with the payments of each method, the count and the amount", async () => {
  const screen = await renderScreen(createServices());

  const table = cashiersTable(screen);
  await expect.element(table.getByRole("columnheader", { name: "Cajero" })).toBeVisible();
  await expect.element(table.getByRole("columnheader", { name: "Transferencias" })).toBeVisible();
  await expect
    .element(table.getByRole("columnheader", { name: "Terminal independiente" }))
    .toBeVisible();
  await expect.element(table.getByRole("columnheader", { name: "Pagos" })).toBeVisible();
  await expect.element(table.getByRole("columnheader", { name: "Importe" })).toBeVisible();
  const ana = table.getByRole("row", { name: /Ana/ });
  await expect.element(ana.getByText("$ 1.000,00")).toBeVisible();
  await expect.element(ana.getByText("$ 400,00")).toBeVisible();
  await expect.element(ana.getByText("2", { exact: true })).toBeVisible();
  await expect.element(ana.getByText("$ 1.400,00")).toBeVisible();
});

test("names a cashier the cloud could not identify", async () => {
  const screen = await renderScreen(createServices());

  const unknown = cashiersTable(screen).getByRole("row", { name: /Sin identificar/ });
  await expect.element(unknown.getByText("$ 500,00").first()).toBeVisible();
});

test("shows two cashiers of unknown name as two rows", async () => {
  const services = createServices();
  vi.mocked(services.fetchHandConfirmedPayments).mockResolvedValue({
    kind: "ok",
    value: {
      ...weekHandConfirmedReport,
      cashiers: weekHandConfirmedReport.cashiers.map((cashier) => ({
        ...cashier,
        cashier_name: null,
      })),
    },
  });

  const screen = await renderScreen(services);

  await expect
    .poll(() =>
      cashiersTable(screen)
        .getByRole("row", { name: /Sin identificar/ })
        .elements(),
    )
    .toHaveLength(2);
});

test("shows each payment with its day and time, its method, its operation, who confirmed it and its amount", async () => {
  const screen = await renderScreen(createServices());

  const table = paymentsTable(screen);
  await expect.element(table.getByRole("columnheader", { name: "Confirmado" })).toBeVisible();
  await expect.element(table.getByRole("columnheader", { name: "Medio" })).toBeVisible();
  await expect.element(table.getByRole("columnheader", { name: "Cajero" })).toBeVisible();
  await expect.element(table.getByRole("columnheader", { name: "Confirmó" })).toBeVisible();
  await expect.element(table.getByRole("columnheader", { name: "Importe" })).toBeVisible();
  const first = table.getByRole("row", { name: /Operación 000007/ });
  await expect.element(first.getByText("06/10/2026")).toBeVisible();
  await expect.element(first.getByText("14:00")).toBeVisible();
  await expect.element(first.getByText("Transferencia")).toBeVisible();
  await expect.element(first.getByText("Ana")).toBeVisible();
  await expect.element(first.getByText("Beto")).toBeVisible();
  await expect.element(first.getByText("$ 1.000,00")).toBeVisible();
  const terminal = table.getByRole("row", { name: /Operación 000009/ });
  await expect.element(terminal.getByText("Terminal independiente")).toBeVisible();
  await expect.element(terminal.getByText("05/10/2026")).toBeVisible();
});

test("shows the payments in the order the cloud answered them", async () => {
  const screen = await renderScreen(createServices());
  await expect.element(paymentsTable(screen).getByText("14:00")).toBeVisible();

  const times = paymentsTable(screen)
    .getByRole("row")
    .elements()
    .map((row) => /\d{2}:\d{2}/.exec(row.textContent ?? "")?.[0])
    .filter((time) => time !== undefined);
  expect(times).toEqual(["14:00", "12:30", "09:05"]);
});

test("shows no operation for a payment that has no sale", async () => {
  const screen = await renderScreen(createServices());

  const withoutSale = paymentsTable(screen).getByRole("row", { name: /12:30/ });
  await expect.element(withoutSale).toBeVisible();
  expect(withoutSale.getByText(/Operación/).query()).toBeNull();
});

test("asks the cloud for no range when the URL has none, and shows the range it answered", async () => {
  const services = createServices();

  const screen = await renderScreen(services);

  await expect.poll(() => dateSegments(screen, "Desde")).toEqual(["1", "10", "2026"]);
  expect(dateSegments(screen, "Hasta")).toEqual(["7", "10", "2026"]);
  expect(services.fetchHandConfirmedPayments).toHaveBeenCalledWith({});
});

test("asks the cloud for the range, the register and the method the URL names", async () => {
  const services = createServices();

  await renderScreen(services, {
    filters: handConfirmedPaymentsFilters.parse({
      from: "2026-10-02",
      to: "2026-10-05",
      register: FRONT_REGISTER_ID,
      method: "TRANSFER",
    }),
  });

  await expect
    .poll(() => vi.mocked(services.fetchHandConfirmedPayments).mock.lastCall)
    .toEqual([
      { from: "2026-10-02", to: "2026-10-05", register_id: FRONT_REGISTER_ID, method: "TRANSFER" },
    ]);
});

test("asks the cloud again for the register chosen in the filters", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Beto").first()).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  await expect
    .poll(() => vi.mocked(services.fetchHandConfirmedPayments).mock.lastCall)
    .toEqual([{ register_id: FRONT_REGISTER_ID }]);
});

test("offers every method and asks the cloud again for the one chosen", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(services, { onFiltersChange });
  await expect.element(screen.getByText("Beto").first()).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Medio:/ }));
  await expect.element(screen.getByRole("option", { name: "Todos" })).toBeVisible();
  await expect
    .element(screen.getByRole("option", { name: "Terminal independiente" }))
    .toBeVisible();
  await userEvent.click(screen.getByRole("option", { name: "Transferencia" }));

  await expect
    .poll(() => vi.mocked(services.fetchHandConfirmedPayments).mock.lastCall)
    .toEqual([{ method: "TRANSFER" }]);
  expect(onFiltersChange).toHaveBeenLastCalledWith(expect.objectContaining({ method: "TRANSFER" }));
});

test("keeps the previous payments in view, marked as updating, while another method loads", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Beto").first()).toBeVisible();
  vi.mocked(services.fetchHandConfirmedPayments).mockReturnValue(new Promise(() => {}));

  await userEvent.click(screen.getByRole("button", { name: /Medio:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Transferencia" }));

  await expect.element(paymentsTable(screen)).toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByText("Beto").first()).toBeVisible();
});

test("shows placeholders while the report loads", async () => {
  const services = createServices();
  vi.mocked(services.fetchHandConfirmedPayments).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect.element(paymentsTable(screen)).toHaveAttribute("aria-busy", "true");
  await expect.element(cashiersTable(screen)).toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByText("Pagos", { exact: true }).first()).toBeVisible();
  expect(screen.getByText("$ 1.900,00").query()).toBeNull();
});

test("says there are no payments confirmed by hand in the period when there are none", async () => {
  const services = createServices();
  vi.mocked(services.fetchHandConfirmedPayments).mockResolvedValue({
    kind: "ok",
    value: emptyHandConfirmedReport,
  });

  const screen = await renderScreen(services);

  await expect
    .element(paymentsTable(screen).getByText("No hay pagos confirmados a mano en este período"))
    .toBeVisible();
  await expect.element(screen.getByText("$ 0,00").first()).toBeVisible();
  await expect
    .element(cashiersTable(screen).getByText("No hay pagos por cajero en este período"))
    .toBeVisible();
});

test.each([
  ["a register", { register: FRONT_REGISTER_ID }],
  ["a method", { method: "TRANSFER" }],
])(
  "says there are none in the period when %s is chosen and none were confirmed",
  async (_name, chosen) => {
    const services = createServices();
    vi.mocked(services.fetchHandConfirmedPayments).mockResolvedValue({
      kind: "ok",
      value: emptyHandConfirmedReport,
    });

    const screen = await renderScreen(services, {
      filters: handConfirmedPaymentsFilters.parse(chosen),
    });

    await expect
      .element(paymentsTable(screen).getByText("No hay pagos confirmados a mano en este período"))
      .toBeVisible();
  },
);

test("shows a failed load with a retry that loads the report again", async () => {
  const services = createServices();
  vi.mocked(services.fetchHandConfirmedPayments)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: weekHandConfirmedReport });
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }).first());

  await expect.element(screen.getByText("Beto").first()).toBeVisible();
  expect(services.fetchHandConfirmedPayments).toHaveBeenCalledTimes(2);
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.fetchHandConfirmedPayments).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
