import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { readDownloadedXlsx } from "../platform/spreadsheet/test-support/read-xlsx";
import { render } from "../shell/test-support/render-with-router";
import { periodSegments } from "../shell/test-support/report-dates";
import { BACK_REGISTER_ID, FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import {
  createReportRegisterFilterServices,
  type ReportRegisterFilterServices,
  reportRegisterFieldForTests,
} from "../shell/test-support/report-register-filter";
import { spyOnDownloads } from "../shell/test-support/spy-on-downloads";
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
  await expect.element(screen.getByText(/^Pagos\$ 1\.900,003$/)).toBeVisible();
  await expect.element(screen.getByText(/^Transferencias\$ 1\.500,002$/)).toBeVisible();
  await expect.element(screen.getByText(/^Terminal independiente\$ 400,001$/)).toBeVisible();
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

  await expect.poll(() => periodSegments(screen).slice(0, 3)).toEqual(["1", "10", "2026"]);
  expect(periodSegments(screen).slice(3)).toEqual(["7", "10", "2026"]);
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
    .element(screen.getByText("No hay pagos confirmados a mano en este período"))
    .toBeVisible();
  await expect.element(screen.getByText(/^Pagos\$ 0,000$/)).toBeVisible();
  expect(screen.getByRole("table").query()).toBeNull();
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
      .element(screen.getByText("No hay pagos confirmados a mano en este período"))
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

afterEach(() => {
  vi.restoreAllMocks();
});

test("downloads a spreadsheet of the payments shown, with the applied register and method", async () => {
  const downloads = spyOnDownloads();
  const screen = await renderScreen(createServices(), {
    filters: handConfirmedPaymentsFilters.parse({ register: BACK_REGISTER_ID, method: "TRANSFER" }),
  });
  await expect
    .element(screen.getByRole("combobox", { name: /^Caja:/ }))
    .toHaveValue("Caja del fondo");
  await expect.element(screen.getByText("Beto").first()).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Descargar planilla" }));

  await expect
    .poll(() => downloads.names)
    .toEqual(["pagos-confirmados-a-mano-2026-10-01-2026-10-07.xlsx"]);
  const file = await readDownloadedXlsx(downloads.blobs[0]);
  expect(file.sheetNames).toEqual(["Resumen", "Por cajero", "Detalle de pagos"]);
  const summary = file.sheet(0);
  expect(summary.get("B4")?.value).toBe("Caja del fondo");
  expect(summary.get("B5")?.value).toBe("Transferencia");
  expect(summary.get("B6")?.value).toBe("3");
  expect(summary.get("B7")?.value).toBe("1900");
  const cashiers = file.sheet(1);
  expect(cashiers.get("A2")?.value).toBe("Ana");
  expect(cashiers.get("C2")?.value).toBe("1000");
  expect(cashiers.get("G2")?.value).toBe("1400");
  expect(cashiers.get("A3")?.value).toBe("Sin identificar");
  const payments = file.sheet(2);
  expect(payments.get("A2")).toMatchObject({ numberFormat: "dd/mm/yyyy hh:mm" });
  expect(payments.get("C2")?.value).toBe("Operación 000007");
  expect(payments.get("F2")?.value).toBe("1000");
  expect(payments.get("B4")?.value).toBe("Terminal independiente");
});

test("has its download disabled while the report loads and after loading fails", async () => {
  const services = createServices();
  vi.mocked(services.fetchHandConfirmedPayments).mockReturnValue(new Promise(() => {}));
  const loading = await renderScreen(services);
  await expect.element(loading.getByRole("button", { name: "Descargar planilla" })).toBeDisabled();
  await loading.unmount();

  vi.mocked(services.fetchHandConfirmedPayments).mockResolvedValue({ kind: "failed" });
  const failed = await renderScreen(services);
  await expect.element(failed.getByRole("button", { name: "Reintentar" }).first()).toBeVisible();
  await expect.element(failed.getByRole("button", { name: "Descargar planilla" })).toBeDisabled();
});
