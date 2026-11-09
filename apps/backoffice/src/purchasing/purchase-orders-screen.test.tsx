import type { PurchaseOrderSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { BackofficeAccess } from "../shell/backoffice-access";
import { ADMINISTRATOR_ACCESS, accessWith } from "../shell/test-support/backoffice-access";
import { render } from "../shell/test-support/render-with-router";
import { type PurchaseOrdersFilters, purchaseOrdersFilters } from "./purchase-orders-filters";
import { PurchaseOrdersScreen } from "./purchase-orders-screen";
import type { PurchaseOrdersScreenServices } from "./purchase-orders-services";
import { createPanelServices } from "./test-support/purchase-order-panel";
import {
  CANCELLED_SUMMARY,
  DRAFT_SUMMARY,
  ORDER_ID,
  PRICED_SUMMARY,
  SENT_ORDER,
  SENT_ORDER_WITH_RECEIPTS,
  SENT_SUMMARY,
} from "./test-support/purchase-orders";

beforeEach(async () => {
  await page.viewport(1280, 900);
  window.history.pushState(null, "", "/");
});

function createServices(
  overrides: Partial<PurchaseOrdersScreenServices> = {},
): PurchaseOrdersScreenServices {
  return {
    fetchPurchaseOrders: vi.fn(),
    fetchSupplierName: vi.fn(),
    fetchPendingPurchaseOrdersReport: vi.fn(),
    fetchReceiptDifferencesReport: vi.fn(),
    ...createPanelServices(),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function renderScreen(
  services: PurchaseOrdersScreenServices,
  {
    filters = purchaseOrdersFilters.parse({}),
    onFiltersChange = () => {},
    access = ADMINISTRATOR_ACCESS,
    openOrder,
    received = false,
    onOpenOrderChange = () => {},
    onReceive = () => {},
    onOpenPurchases = () => {},
    onReceivedNoticeDismissed = () => {},
    onSessionEnded = () => {},
  }: {
    filters?: PurchaseOrdersFilters;
    onFiltersChange?: (filters: PurchaseOrdersFilters) => void;
    access?: BackofficeAccess;
    openOrder?: string;
    received?: boolean;
    onOpenOrderChange?: (orderId: string | undefined) => void;
    onReceive?: (orderId: string) => void;
    onOpenPurchases?: () => void;
    onReceivedNoticeDismissed?: () => void;
    onSessionEnded?: () => void;
  } = {},
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <PurchaseOrdersScreen
          services={services}
          filters={filters}
          onFiltersChange={onFiltersChange}
          access={access}
          openOrder={openOrder}
          received={received}
          onOpenOrderChange={onOpenOrderChange}
          onReceive={onReceive}
          onOpenPurchases={onOpenPurchases}
          onReceivedNoticeDismissed={onReceivedNoticeDismissed}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>,
  );
}

type Screen = Awaited<ReturnType<typeof renderScreen>>;

function rowOf(screen: Screen, supplier: string) {
  return screen.getByRole("row", { name: new RegExp(supplier) });
}

async function loaded(
  services: PurchaseOrdersScreenServices,
  orders: PurchaseOrderSummary[],
  options: Parameters<typeof renderScreen>[1] = {},
) {
  vi.mocked(services.fetchPurchaseOrders).mockResolvedValue({ kind: "ok", value: orders });
  const screen = await renderScreen(services, options);
  await expect.element(screen.getByRole("table", { name: "Pedidos de compra" })).toBeVisible();
  return screen;
}

test("shows every order with its supplier, date, lines, expected total and state", async () => {
  const services = createServices();
  const screen = await loaded(services, [PRICED_SUMMARY, CANCELLED_SUMMARY]);

  expect(screen.getByRole("heading", { level: 1 }).query()).toBeNull();
  const priced = rowOf(screen, "Granos del Sur").first();
  await expect.element(priced.getByText("11/03/2026")).toBeVisible();
  await expect.element(priced.getByText("1", { exact: true })).toBeVisible();
  await expect.element(priced.getByText("$ 1.200,00")).toBeVisible();
  await expect.element(priced.getByText("Borrador")).toBeVisible();
  await expect.element(screen.getByText("Cancelado")).toBeVisible();
  expect(services.fetchPurchaseOrders).toHaveBeenCalledWith("ALL");
});

test("shows the day an order was created in Argentina", async () => {
  const services = createServices();
  const screen = await loaded(services, [
    { ...PRICED_SUMMARY, createdAt: "2026-03-10T01:30:00.000Z" },
  ]);

  await expect.element(rowOf(screen, "Granos del Sur").getByText("09/03/2026")).toBeVisible();
});

test("says a line has no list price next to the total that leaves it out", async () => {
  const services = createServices();
  const screen = await loaded(services, [DRAFT_SUMMARY, PRICED_SUMMARY]);

  const unpriced = rowOf(screen, "Distribuidora Andina");
  await expect.element(unpriced.getByText("$ 5.550,00")).toBeVisible();
  await expect.element(unpriced.getByText("Hay líneas sin precio de lista")).toBeVisible();
  expect(
    rowOf(screen, "Granos del Sur").getByText("Hay líneas sin precio de lista").query(),
  ).toBeNull();
});

test("counts the orders in the footer", async () => {
  const services = createServices();
  const screen = await loaded(services, [DRAFT_SUMMARY, PRICED_SUMMARY, CANCELLED_SUMMARY]);

  await expect.element(screen.getByText("3 pedidos")).toBeVisible();
});

test("says there are no orders yet, and nothing else", async () => {
  const services = createServices();
  const screen = await loaded(services, []);
  const table = screen.getByRole("table", { name: "Pedidos de compra" });

  await expect.element(table.getByText("Todavía no hay pedidos")).toBeVisible();
  expect(table.element().querySelector("tbody")?.textContent).toBe("Todavía no hay pedidos");
});

test("the state filter asks the cloud for that state and reports the filters", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();
  const screen = await loaded(services, [DRAFT_SUMMARY, CANCELLED_SUMMARY], { onFiltersChange });
  vi.mocked(services.fetchPurchaseOrders).mockResolvedValue({
    kind: "ok",
    value: [CANCELLED_SUMMARY],
  });

  await userEvent.click(screen.getByRole("button", { name: /Estado:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Cancelados" }));

  await expect.poll(() => services.fetchPurchaseOrders).toHaveBeenCalledWith("CANCELLED");
  await expect.element(screen.getByText("Distribuidora Andina")).not.toBeInTheDocument();
  await expect.poll(() => onFiltersChange.mock.lastCall?.[0]).toEqual({ state: "CANCELLED" });
});

test("the state filter offers Todos, Borradores, Enviados, Recibidos en parte, Recibidos and Cancelados", async () => {
  const services = createServices();
  const screen = await loaded(services, [DRAFT_SUMMARY]);

  await userEvent.click(screen.getByRole("button", { name: /Estado:/ }));

  await expect.element(screen.getByRole("option", { name: "Todos" })).toBeVisible();
  await expect.element(screen.getByRole("option", { name: "Borradores" })).toBeVisible();
  await expect.element(screen.getByRole("option", { name: "Enviados" })).toBeVisible();
  await expect.element(screen.getByRole("option", { name: "Recibidos en parte" })).toBeVisible();
  await expect
    .element(screen.getByRole("option", { name: "Recibidos", exact: true }))
    .toBeVisible();
  await expect.element(screen.getByRole("option", { name: "Cancelados" })).toBeVisible();
});

test.each([
  ["Recibidos en parte", "PARTIALLY_RECEIVED"],
  ["Recibidos", "RECEIVED"],
] as const)("the state filter offers %s and asks the cloud for them", async (label, state) => {
  const services = createServices();
  const screen = await loaded(services, [DRAFT_SUMMARY]);

  await userEvent.click(screen.getByRole("button", { name: /Estado:/ }));
  await userEvent.click(screen.getByRole("option", { name: label, exact: true }));

  await expect.poll(() => services.fetchPurchaseOrders).toHaveBeenCalledWith(state);
});

test.each([
  ["PARTIALLY_RECEIVED", "Recibido en parte"],
  ["RECEIVED", "Recibido"],
] as const)("lists an order in state %s as %s", async (state, label) => {
  const services = createServices();
  const screen = await loaded(services, [{ ...DRAFT_SUMMARY, state }]);

  await expect
    .element(rowOf(screen, "Distribuidora Andina").getByText(label, { exact: true }))
    .toBeVisible();
});

test("lists a sent order as Enviado", async () => {
  const services = createServices();
  const screen = await loaded(services, [SENT_SUMMARY]);

  await expect.element(rowOf(screen, "Distribuidora Andina").getByText("Enviado")).toBeVisible();
});

test("the state filter offers Enviados and asks the cloud for them", async () => {
  const services = createServices();
  const screen = await loaded(services, [DRAFT_SUMMARY]);

  await userEvent.click(screen.getByRole("button", { name: /Estado:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Enviados" }));

  await expect.poll(() => services.fetchPurchaseOrders).toHaveBeenCalledWith("SENT");
});

test("opens on the filter the URL carries", async () => {
  const services = createServices();
  await loaded(services, [CANCELLED_SUMMARY], {
    filters: purchaseOrdersFilters.parse({ state: "CANCELLED" }),
  });

  expect(services.fetchPurchaseOrders).toHaveBeenCalledWith("CANCELLED");
});

test("says nothing matches when a state has no orders", async () => {
  const services = createServices();
  const screen = await loaded(services, [], {
    filters: purchaseOrdersFilters.parse({ state: "CANCELLED" }),
  });

  const table = screen.getByRole("table", { name: "Pedidos de compra" });
  await expect.element(table.getByText("Sin resultados")).toBeVisible();
  await expect.element(table.getByText("Probá con otro estado.")).toBeVisible();
  expect(table.getByText("Todavía no hay pedidos").query()).toBeNull();
});

test("pressing an order's row asks to open its order", async () => {
  const services = createServices();
  const onOpenOrderChange = vi.fn();
  const screen = await loaded(services, [DRAFT_SUMMARY, CANCELLED_SUMMARY], {
    onOpenOrderChange,
  });

  await userEvent.click(rowOf(screen, "Distribuidora Andina").getByText("Borrador"));

  expect(onOpenOrderChange).toHaveBeenCalledWith(DRAFT_SUMMARY.id);
});

test("the open action of an order's row asks to open its order", async () => {
  const services = createServices();
  const onOpenOrderChange = vi.fn();
  const screen = await loaded(services, [DRAFT_SUMMARY, CANCELLED_SUMMARY], {
    onOpenOrderChange,
  });

  await userEvent.click(
    rowOf(screen, "Distribuidora Andina").getByRole("button", {
      name: "Abrir el pedido de Distribuidora Andina",
    }),
  );

  expect(onOpenOrderChange).toHaveBeenCalledWith(DRAFT_SUMMARY.id);
});

test("shows no panel while no order is open", async () => {
  const services = createServices();
  const screen = await loaded(services, [DRAFT_SUMMARY]);

  expect(screen.getByRole("complementary").query()).toBeNull();
  expect(services.fetchPurchaseOrder).not.toHaveBeenCalled();
});

test("shows the open order in a panel with its lines, sharing, cancelling and receipt differences, beside the list", async () => {
  const services = createServices({
    fetchPurchaseOrder: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { kind: "found", order: SENT_ORDER_WITH_RECEIPTS },
    }),
  });
  const screen = await loaded(services, [DRAFT_SUMMARY, CANCELLED_SUMMARY], {
    openOrder: ORDER_ID,
  });

  const panel = screen.getByRole("complementary", { name: "Pedido a Distribuidora Andina" });
  await expect.element(panel).toBeVisible();
  expect(services.fetchPurchaseOrder).toHaveBeenCalledWith(ORDER_ID);
  await expect.element(panel.getByRole("table", { name: "Líneas del pedido" })).toBeVisible();
  await expect.element(panel.getByRole("button", { name: "Compartir pedido" })).toBeVisible();
  await expect.element(panel.getByRole("button", { name: "Cancelar pedido" })).toBeVisible();
  await expect
    .element(panel.getByRole("heading", { name: "Diferencias de recepción" }))
    .toBeVisible();
  await expect.element(screen.getByRole("table", { name: "Pedidos de compra" })).toBeVisible();
  await expect.element(rowOf(screen, "Granos del Sur")).toBeVisible();
});

test("closing the panel asks to open no order", async () => {
  const services = createServices();
  const onOpenOrderChange = vi.fn();
  const screen = await loaded(services, [DRAFT_SUMMARY], {
    openOrder: ORDER_ID,
    onOpenOrderChange,
  });
  await expect
    .element(screen.getByRole("complementary", { name: "Pedido a Distribuidora Andina" }))
    .toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

  expect(onOpenOrderChange).toHaveBeenCalledWith(undefined);
});

test("the panel's Recibir pedido asks to receive that order", async () => {
  const services = createServices({
    fetchPurchaseOrder: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { kind: "found", order: SENT_ORDER },
    }),
  });
  const onReceive = vi.fn();
  const screen = await loaded(services, [SENT_SUMMARY], {
    openOrder: ORDER_ID,
    access: accessWith("purchase_order_reads", "purchase_order_receipts"),
    onReceive,
  });

  await userEvent.click(screen.getByRole("button", { name: "Recibir pedido" }));

  expect(onReceive).toHaveBeenCalledWith(ORDER_ID);
});

test("says the receipt was registered when the person comes back from it, and asks to clear the mark when dismissed", async () => {
  const services = createServices();
  const onReceivedNoticeDismissed = vi.fn();
  const screen = await loaded(services, [DRAFT_SUMMARY], {
    openOrder: ORDER_ID,
    received: true,
    onReceivedNoticeDismissed,
  });

  await expect.element(screen.getByText("Recepción registrada")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }).last());
  expect(onReceivedNoticeDismissed).toHaveBeenCalled();
});

test("reads the orders again after the panel cancels one", async () => {
  const services = createServices({
    fetchPurchaseOrder: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { kind: "found", order: SENT_ORDER },
    }),
    cancelPurchaseOrder: vi.fn().mockResolvedValue({ kind: "ok", order: SENT_ORDER }),
  });
  const screen = await loaded(services, [SENT_SUMMARY], { openOrder: ORDER_ID });
  const readsBefore = vi.mocked(services.fetchPurchaseOrders).mock.calls.length;

  await userEvent.click(screen.getByRole("button", { name: "Cancelar pedido" }));
  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Cancelar pedido" }),
  );

  await expect
    .poll(() => vi.mocked(services.fetchPurchaseOrders).mock.calls.length)
    .toBeGreaterThan(readsBefore);
});

test("shows a load error with a retry action that starts again from the loading placeholder", async () => {
  const services = createServices();
  const retry = deferred<Awaited<ReturnType<typeof services.fetchPurchaseOrders>>>();
  vi.mocked(services.fetchPurchaseOrders)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir los pedidos")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByRole("table", { name: "Pedidos de compra" }))
    .toHaveAttribute("aria-busy", "true");
  retry.resolve({ kind: "ok", value: [DRAFT_SUMMARY] });
  await expect.element(screen.getByText("Distribuidora Andina")).toBeVisible();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const services = createServices();
  vi.mocked(services.fetchPurchaseOrders).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 60,
  });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
});

test("ends the session when the orders come back unauthenticated", async () => {
  const services = createServices();
  vi.mocked(services.fetchPurchaseOrders).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when the orders come back forbidden", async () => {
  window.history.pushState(null, "", "/purchase-orders");
  const services = createServices();
  vi.mocked(services.fetchPurchaseOrders).mockResolvedValue({ kind: "forbidden" });
  await renderScreen(services);

  await expect
    .poll(() => window.location.pathname + window.location.search)
    .toBe("/?account=credentials");
});

test("has no accessibility violations once loaded", async () => {
  const services = createServices();
  const screen = await loaded(services, [DRAFT_SUMMARY, CANCELLED_SUMMARY]);

  await expectNoAccessibilityViolations(screen.container);
});
