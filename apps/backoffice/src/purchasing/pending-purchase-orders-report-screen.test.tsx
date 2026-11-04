import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations, tokenRgb } from "@purosur/ui/test";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { readDownloadedXlsx } from "../platform/spreadsheet/test-support/read-xlsx";
import { type ReportPeriodFilters, reportPeriodSearch } from "../shell/report-filters-search";
import { render } from "../shell/test-support/render-with-router";
import { dateSegments, typeDate } from "../shell/test-support/report-dates";
import { spyOnDownloads } from "../shell/test-support/spy-on-downloads";
import { PendingPurchaseOrdersReportScreen } from "./pending-purchase-orders-report-screen";
import type { PendingPurchaseOrdersReportScreenServices } from "./pending-purchase-orders-report-services";
import {
  emptyPendingPurchaseOrdersReport,
  pendingPurchaseOrdersReport,
} from "./test-support/pending-purchase-orders-report-fixtures";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createServices(): PendingPurchaseOrdersReportScreenServices {
  const services = { fetchPendingPurchaseOrdersReport: vi.fn() };
  services.fetchPendingPurchaseOrdersReport.mockResolvedValue({
    kind: "ok",
    value: pendingPurchaseOrdersReport,
  });
  return services;
}

type Handlers = {
  filters?: ReportPeriodFilters;
  mayOpenOrders?: boolean;
  onFiltersChange?: (filters: ReportPeriodFilters) => void;
  onOpenOrder?: (orderId: string) => void;
  onSessionEnded?: () => void;
};

function ControlledScreen({
  services,
  filters: initial = reportPeriodSearch.parse({}),
  mayOpenOrders = true,
  onFiltersChange = () => {},
  onOpenOrder = () => {},
  onSessionEnded = () => {},
}: Handlers & { services: PendingPurchaseOrdersReportScreenServices }) {
  const [filters, setFilters] = useState(initial);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <PendingPurchaseOrdersReportScreen
          services={services}
          filters={filters}
          mayOpenOrders={mayOpenOrders}
          onFiltersChange={(next) => {
            onFiltersChange(next);
            setFilters(next);
          }}
          onOpenOrder={onOpenOrder}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>
  );
}

function renderScreen(
  services: PendingPurchaseOrdersReportScreenServices,
  handlers: Handlers = {},
) {
  return render(<ControlledScreen services={services} {...handlers} />);
}

type Screen = Awaited<ReturnType<typeof renderScreen>>;

const TITLE = "Pedidos pendientes de recibir";

function ordersTable(screen: Screen) {
  return screen.getByRole("table", { name: TITLE, exact: true });
}

function emptyStateIconColor(title: Element): string {
  const icon = title.parentElement?.querySelector("svg");
  return icon ? getComputedStyle(icon).color : "";
}

const ANDINA = "90e00000-0000-4000-8000-0000000000b1";

test("titles the report under the purchases reports", async () => {
  const screen = await renderScreen(createServices());

  await expect.element(screen.getByRole("heading", { name: TITLE, level: 1 })).toBeVisible();
  await expect.element(screen.getByText("Reportes · Compras", { exact: true })).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("shows the pending orders, the suppliers and the expected amount, from the cloud", async () => {
  const screen = await renderScreen(createServices());

  await expect.element(screen.getByText(/^Pedidos pendientes3$/)).toBeVisible();
  await expect.element(screen.getByText(/^Proveedores2$/)).toBeVisible();
  await expect.element(screen.getByText(/\$ 7\.550,50$/)).toBeVisible();
});

test("warns on the expected amount when some line has no list price", async () => {
  const screen = await renderScreen(createServices());

  await expect
    .element(screen.getByText(/^Importe esperadoHay líneas sin precio de lista\$ 7\.550,50$/))
    .toBeVisible();
});

test("shows no warning on the expected amount when every line is priced", async () => {
  const services = createServices();
  vi.mocked(services.fetchPendingPurchaseOrdersReport).mockResolvedValue({
    kind: "ok",
    value: {
      ...pendingPurchaseOrdersReport,
      totals: { ...pendingPurchaseOrdersReport.totals, has_unpriced_line: false },
    },
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText(/^Importe esperado\$ 7\.550,50$/)).toBeVisible();
});

test("writes a count of orders as a number reads in Spanish", async () => {
  const services = createServices();
  vi.mocked(services.fetchPendingPurchaseOrdersReport).mockResolvedValue({
    kind: "ok",
    value: {
      ...pendingPurchaseOrdersReport,
      totals: { ...pendingPurchaseOrdersReport.totals, orders: 1_200 },
    },
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText(/^Pedidos pendientes1\.200$/)).toBeVisible();
});

test("shows each order with its supplier, the day it was sent in Argentina, its state, its products and its expected amount", async () => {
  const screen = await renderScreen(createServices());

  const table = ordersTable(screen);
  for (const name of ["Proveedor", "Enviado el", "Estado", "Productos", "Importe esperado"]) {
    await expect.element(table.getByRole("columnheader", { name })).toBeVisible();
  }
  const sent = table.getByRole("row", { name: /^Distribuidora Andina 07\/10\/2026/ });
  await expect.element(sent.getByText("Enviado", { exact: true })).toBeVisible();
  await expect.element(sent.getByText("$ 5.550,00", { exact: true })).toBeVisible();
  await expect.element(sent.getByText("Hay líneas sin precio de lista")).toBeVisible();
  const partial = table.getByRole("row", { name: /^Granos del Sur 20\/10\/2026/ });
  await expect.element(partial.getByText("Recibido en parte", { exact: true })).toBeVisible();
  await expect.element(partial.getByText("1.200", { exact: true })).toBeVisible();
  await expect.element(partial.getByText("$ 1.200,50", { exact: true })).toBeVisible();
  expect(partial.getByText("Hay líneas sin precio de lista").query()).toBeNull();
});

test("lists the orders in the order the cloud answered them", async () => {
  const services = createServices();
  const { orders } = pendingPurchaseOrdersReport;
  vi.mocked(services.fetchPendingPurchaseOrdersReport).mockResolvedValue({
    kind: "ok",
    value: { ...pendingPurchaseOrdersReport, orders: [...orders.slice(1), ...orders.slice(0, 1)] },
  });

  const screen = await renderScreen(services);
  await expect.element(ordersTable(screen).getByText("Granos del Sur")).toBeVisible();

  const days = ordersTable(screen)
    .getByRole("row")
    .elements()
    .map((row) => /\d\d\/10\/2026/.exec(row.textContent ?? "")?.[0])
    .filter((day) => day !== undefined);
  expect(days).toEqual(["20/10/2026", "27/10/2026", "07/10/2026"]);
});

test("has no sortable column", async () => {
  const screen = await renderScreen(createServices());
  await expect.element(ordersTable(screen).getByText("Granos del Sur")).toBeVisible();

  expect(
    ordersTable(screen)
      .getByRole("button", { name: /Proveedor|Enviado el/ })
      .query(),
  ).toBeNull();
});

test("opens an order from its row", async () => {
  const onOpenOrder = vi.fn();
  const screen = await renderScreen(createServices(), { onOpenOrder });
  await expect.element(ordersTable(screen).getByText("Granos del Sur")).toBeVisible();

  await userEvent.click(
    ordersTable(screen)
      .getByRole("row", { name: /^Distribuidora Andina 07\/10\/2026/ })
      .getByRole("button", { name: "Abrir el pedido de Distribuidora Andina" }),
  );

  expect(onOpenOrder).toHaveBeenCalledWith(ANDINA);
});

test("offers no way to open an order to a person who may not read orders", async () => {
  const screen = await renderScreen(createServices(), { mayOpenOrders: false });
  await expect.element(ordersTable(screen).getByText("Granos del Sur")).toBeVisible();

  expect(ordersTable(screen).getByRole("columnheader", { name: "Acciones" }).query()).toBeNull();
  expect(
    ordersTable(screen)
      .getByRole("button", { name: /^Abrir el pedido/ })
      .elements(),
  ).toHaveLength(0);
});

test("asks the cloud for no range when the URL has none, and shows the range it answered", async () => {
  const services = createServices();

  const screen = await renderScreen(services);

  await expect.poll(() => dateSegments(screen, "Desde")).toEqual(["5", "10", "2026"]);
  expect(dateSegments(screen, "Hasta")).toEqual(["4", "11", "2026"]);
  expect(services.fetchPendingPurchaseOrdersReport).toHaveBeenCalledWith({});
});

test("asks the cloud for the range the URL names", async () => {
  const services = createServices();

  await renderScreen(services, {
    filters: reportPeriodSearch.parse({ from: "2026-10-02", to: "2026-10-05" }),
  });

  await expect
    .poll(() => vi.mocked(services.fetchPendingPurchaseOrdersReport).mock.lastCall)
    .toEqual([{ from: "2026-10-02", to: "2026-10-05" }]);
});

test("asks the cloud again for the range typed in the filters and reports it", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(services, { onFiltersChange });
  await expect.element(screen.getByText("Granos del Sur")).toBeVisible();

  await typeDate(screen, "Desde", "01102026");
  await typeDate(screen, "Hasta", "07102026");

  await expect
    .poll(() => vi.mocked(services.fetchPendingPurchaseOrdersReport).mock.lastCall)
    .toEqual([{ from: "2026-10-01", to: "2026-10-07" }]);
  expect(onFiltersChange).toHaveBeenLastCalledWith({ from: "2026-10-01", to: "2026-10-07" });
});

test("keeps the previous report in view, marked as updating, while another range loads", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Granos del Sur")).toBeVisible();
  vi.mocked(services.fetchPendingPurchaseOrdersReport).mockReturnValue(new Promise(() => {}));

  await typeDate(screen, "Desde", "01102026");
  await typeDate(screen, "Hasta", "07102026");

  await expect.element(ordersTable(screen)).toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByText("Granos del Sur")).toBeVisible();
});

test("shows placeholders while the report loads", async () => {
  const services = createServices();
  vi.mocked(services.fetchPendingPurchaseOrdersReport).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect.element(ordersTable(screen)).toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByText("Importe esperado", { exact: true }).first()).toBeVisible();
  expect(screen.getByText("$ 7.550,50").query()).toBeNull();
});

test("says there are no pending orders when there are none", async () => {
  const services = createServices();
  vi.mocked(services.fetchPendingPurchaseOrdersReport).mockResolvedValue({
    kind: "ok",
    value: emptyPendingPurchaseOrdersReport,
  });

  const screen = await renderScreen(services);

  const empty = ordersTable(screen).getByText(
    "No hay pedidos pendientes de recibir en este período",
  );
  await expect.element(empty).toBeVisible();
  await expect.element(screen.getByText(/^Pedidos pendientes0$/)).toBeVisible();
  expect(emptyStateIconColor(empty.element())).toBe(tokenRgb("text-accent"));
});

test("says there are no pending orders in the chosen period as a filtered result", async () => {
  const services = createServices();
  vi.mocked(services.fetchPendingPurchaseOrdersReport).mockResolvedValue({
    kind: "ok",
    value: emptyPendingPurchaseOrdersReport,
  });

  const screen = await renderScreen(services, {
    filters: reportPeriodSearch.parse({ from: "2026-10-02", to: "2026-10-05" }),
  });

  const empty = ordersTable(screen).getByText(
    "No hay pedidos pendientes de recibir en este período",
  );
  await expect.element(empty).toBeVisible();
  expect(emptyStateIconColor(empty.element())).toBe(tokenRgb("text-subtle"));
});

test("shows a failed load with a retry that loads the report again, and no figures", async () => {
  const services = createServices();
  vi.mocked(services.fetchPendingPurchaseOrdersReport)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: pendingPurchaseOrdersReport });
  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("button", { name: "Reintentar" }).first()).toBeVisible();
  expect(screen.getByText("Proveedores", { exact: true }).query()).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }).first());

  await expect.element(screen.getByText("Granos del Sur")).toBeVisible();
  expect(services.fetchPendingPurchaseOrdersReport).toHaveBeenCalledTimes(2);
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.fetchPendingPurchaseOrdersReport).mockResolvedValue({
    kind: "unauthenticated",
  });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("sends the person to Mi cuenta when the cloud refuses the report", async () => {
  const services = createServices();
  vi.mocked(services.fetchPendingPurchaseOrdersReport).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("downloads a spreadsheet of the orders shown, for the period the report answered", async () => {
  const downloads = spyOnDownloads();
  const screen = await renderScreen(createServices());
  await expect.element(ordersTable(screen).getByText("Granos del Sur")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Descargar planilla" }));

  await expect
    .poll(() => downloads.names)
    .toEqual(["pedidos-pendientes-de-recibir-2026-10-05-2026-11-04.xlsx"]);
  const file = await readDownloadedXlsx(downloads.blobs[0]);
  expect(file.sheetNames).toEqual(["Resumen", "Pedidos pendientes de recibir"]);
  expect(file.sheet(0).get("B4")?.value).toBe("3");
  expect(file.sheet(0).get("B6")?.value).toBe("7550.5");
  expect(file.sheet(1).get("A2")?.value).toBe("Distribuidora Andina");
  expect(file.sheet(1).get("E3")?.value).toBe("1200.5");
});

test("has its download disabled while the report loads and after loading fails", async () => {
  const services = createServices();
  vi.mocked(services.fetchPendingPurchaseOrdersReport).mockReturnValue(new Promise(() => {}));
  const loading = await renderScreen(services);
  await expect.element(loading.getByRole("button", { name: "Descargar planilla" })).toBeDisabled();
  await loading.unmount();

  vi.mocked(services.fetchPendingPurchaseOrdersReport).mockResolvedValue({ kind: "failed" });
  const failed = await renderScreen(services);
  await expect.element(failed.getByRole("button", { name: "Reintentar" })).toBeVisible();
  await expect.element(failed.getByRole("button", { name: "Descargar planilla" })).toBeDisabled();
});
