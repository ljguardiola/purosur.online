import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { type ReportPeriodFilters, reportPeriodSearch } from "../shell/report-filters-search";
import { render } from "../shell/test-support/render-with-router";
import { PendingPurchaseOrdersReportScreen } from "./pending-purchase-orders-report-screen";
import type { PendingPurchaseOrdersReportScreenServices } from "./pending-purchase-orders-report-services";
import { pendingPurchaseOrdersReport } from "./test-support/pending-purchase-orders-report-fixtures";

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

const ANDINA = "90e00000-0000-4000-8000-0000000000b1";

test("titles the report under the purchases reports", async () => {
  const screen = await renderScreen(createServices());

  await expect.element(screen.getByRole("heading", { name: TITLE, level: 1 })).toBeVisible();
  await expect.element(screen.getByText("Reportes · Compras", { exact: true })).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("opens an order from its row and from its button", async () => {
  const onOpenOrder = vi.fn();
  const screen = await renderScreen(createServices(), { onOpenOrder });
  const andina = ordersTable(screen).getByRole("row", {
    name: /^Distribuidora Andina 07\/10\/2026/,
  });
  await expect.element(andina).toBeVisible();

  await userEvent.click(andina.getByText("Enviado", { exact: true }));
  expect(onOpenOrder).toHaveBeenCalledExactlyOnceWith(ANDINA);

  await userEvent.click(
    andina.getByRole("button", { name: "Abrir el pedido de Distribuidora Andina" }),
  );
  expect(onOpenOrder).toHaveBeenCalledTimes(2);
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
