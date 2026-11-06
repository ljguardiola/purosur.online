import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ORDER_SUGGESTION } from "../purchasing/test-support/order-suggestion";
import {
  DRAFT_ORDER,
  DRAFT_SUMMARY,
  ORDER_ID,
  RECEIPT_DRAFT,
  SENT_ORDER,
} from "../purchasing/test-support/purchase-orders";
import { PRICE_COMPARISON } from "../purchasing/test-support/supplier-price-comparison";
import {
  EXTRACTED_ROWS,
  READ_LIST,
  reviewOf,
} from "../purchasing/test-support/supplier-price-lists";
import { openSession } from "../sessions/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState, threeOpenAlerts } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens([
  "/",
  "/alerts",
  "/help",
  "/price-comparison",
  "/order-suggestion",
  "/purchase-orders",
  "/purchase-orders/$orderId",
  "/purchase-orders/$orderId/receive",
  "/supplier-price-lists",
  "/supplier-price-lists/$listId",
]);

beforeEach(resetPageState);

function ordersServices(capabilities: Capability[]) {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Villalba",
        isAdministrator: false,
        capabilities,
      }),
    ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.supplierPriceListsScreen.fetchSupplierPriceLists).mockResolvedValue({
    kind: "ok",
    value: [READ_LIST],
  });
  vi.mocked(services.supplierPriceListReviewScreen.fetchSupplierPriceListReview).mockResolvedValue({
    kind: "ok",
    value: { kind: "found", review: reviewOf(READ_LIST, EXTRACTED_ROWS) },
  });
  vi.mocked(services.supplierPriceComparisonScreen.fetchSupplierPriceComparison).mockResolvedValue({
    kind: "ok",
    value: PRICE_COMPARISON,
  });
  vi.mocked(services.orderSuggestionScreen.fetchOrderSuggestion).mockResolvedValue({
    kind: "ok",
    value: ORDER_SUGGESTION,
  });
  return services;
}

test("opens the supplier price lists from the rail's Pedidos item, listing only that section", async () => {
  const services = ordersServices(["supplier_price_lists", "orders_area"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("link", { name: "Pedidos" }));

  await expect
    .element(screen.getByRole("heading", { name: "Listas de proveedores", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/supplier-price-lists");
  const links = screen
    .getByRole("navigation", { name: "Pedidos" })
    .getByRole("link")
    .elements()
    .map((link) => link.textContent);
  expect(links).toEqual(["Listas de proveedores"]);
});

test("hides the Pedidos item in the rail for a user without the orders area", async () => {
  const services = ordersServices(["stock_area", "stock_balances"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Pedidos" }).query()).toBeNull();
});

test("shows the Pedidos item to an Administrator", async () => {
  const services = ordersServices([]);
  vi.mocked(services.fetchSession).mockResolvedValue(openSession());
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("link", { name: "Pedidos" })).toBeVisible();
});

test.each(["/supplier-price-lists", `/supplier-price-lists/${READ_LIST.id}`])(
  "sends a user who may not open %s to Mi cuenta",
  async (path) => {
    const services = ordersServices(["orders_area", "stock_area"]);
    window.history.pushState(null, "", path);

    const screen = await render(<App help={emptyHelp} services={services} />);

    await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
  },
);

test("opens a list's review from the list", async () => {
  const services = ordersServices(["supplier_price_lists", "orders_area"]);
  window.history.pushState(null, "", "/supplier-price-lists?state=EXTRACTED");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(
    screen.getByRole("button", { name: "Abrir la lista de Distribuidora Andina" }),
  );

  await expect
    .element(screen.getByRole("heading", { name: "Lista de Distribuidora Andina", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe(`/supplier-price-lists/${READ_LIST.id}`);
  expect(services.supplierPriceListReviewScreen.fetchSupplierPriceListReview).toHaveBeenCalledWith(
    READ_LIST.id,
  );
});

test("counts the open alerts in the list's top bar and opens the alerts list from it", async () => {
  const services = ordersServices([]);
  vi.mocked(services.fetchSession).mockResolvedValue(openSession());
  vi.mocked(services.alertsOpenCountLink.fetchAlertsOverview).mockResolvedValue(threeOpenAlerts);
  window.history.pushState(null, "", "/supplier-price-lists");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Listas de proveedores", level: 1 }))
    .toBeVisible();
  await userEvent.click(screen.getByRole("link", { name: "3 alertas abiertas" }));

  expect(window.location.pathname).toBe("/alerts");
});

test("lists the price comparison beside the supplier price lists for whoever compares prices", async () => {
  const services = ordersServices(["supplier_price_lists", "price_comparison", "orders_area"]);
  window.history.pushState(null, "", "/supplier-price-lists");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Listas de proveedores", level: 1 }))
    .toBeVisible();
  const links = screen
    .getByRole("navigation", { name: "Pedidos" })
    .getByRole("link")
    .elements()
    .map((link) => link.textContent);
  expect(links).toEqual([
    "Listas de proveedores",
    "Comparación de precios",
    "Sugerencia de pedido",
  ]);
});

test("hides the price comparison from whoever may only manage the lists", async () => {
  const services = ordersServices(["supplier_price_lists", "orders_area"]);
  window.history.pushState(null, "", "/supplier-price-lists");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Listas de proveedores", level: 1 }))
    .toBeVisible();
  expect(screen.getByRole("link", { name: "Comparación de precios" }).query()).toBeNull();
});

test("opens the price comparison from its section, marking it as the section shown", async () => {
  const services = ordersServices(["supplier_price_lists", "price_comparison", "orders_area"]);
  window.history.pushState(null, "", "/supplier-price-lists");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("link", { name: "Comparación de precios" }));

  await expect
    .element(screen.getByRole("heading", { name: "Comparación de precios", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/price-comparison");
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
});

test("sends a user who may not compare prices to Mi cuenta", async () => {
  const services = ordersServices(["supplier_price_lists", "orders_area"]);
  window.history.pushState(null, "", "/price-comparison");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
});

test("hides the order suggestion from whoever may only manage the lists", async () => {
  const services = ordersServices(["supplier_price_lists", "orders_area"]);
  window.history.pushState(null, "", "/supplier-price-lists");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Listas de proveedores", level: 1 }))
    .toBeVisible();
  expect(screen.getByRole("link", { name: "Sugerencia de pedido" }).query()).toBeNull();
});

test("opens the order suggestion from its section, marking it as the section shown", async () => {
  const services = ordersServices(["supplier_price_lists", "price_comparison", "orders_area"]);
  window.history.pushState(null, "", "/supplier-price-lists");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("link", { name: "Sugerencia de pedido" }));

  await expect
    .element(screen.getByRole("heading", { name: "Sugerencia de pedido", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/order-suggestion");
  await expect.element(screen.getByRole("table", { name: "Sugerencia de pedido" })).toBeVisible();
  await expect
    .element(screen.getByRole("link", { name: "Sugerencia de pedido" }))
    .toHaveAttribute("aria-current", "page");
});

test("sends a user who may not compare prices away from the order suggestion to Mi cuenta", async () => {
  const services = ordersServices(["supplier_price_lists", "orders_area"]);
  window.history.pushState(null, "", "/order-suggestion");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
});

test("lists the purchase orders beside the other sections for whoever manages them", async () => {
  const services = ordersServices([
    "supplier_price_lists",
    "purchase_orders",
    "purchase_order_reads",
    "orders_area",
  ]);
  window.history.pushState(null, "", "/supplier-price-lists");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Listas de proveedores", level: 1 }))
    .toBeVisible();
  const links = screen
    .getByRole("navigation", { name: "Pedidos" })
    .getByRole("link")
    .elements()
    .map((link) => link.textContent);
  expect(links).toEqual(["Listas de proveedores", "Pedidos de compra"]);
});

test("opens the purchase orders from the rail's Pedidos item when it is all the user may open", async () => {
  const services = ordersServices(["purchase_orders", "purchase_order_reads", "orders_area"]);
  vi.mocked(services.purchaseOrdersScreen.fetchPurchaseOrders).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("link", { name: "Pedidos", exact: true }));

  await expect
    .element(screen.getByRole("heading", { name: "Pedidos de compra", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/purchase-orders");
});

test.each([
  ["supplier_price_lists", "/supplier-price-lists"],
  ["price_comparison", "/price-comparison"],
] as const)("opens %s first from the rail's Pedidos item", async (capability, path) => {
  const services = ordersServices([
    capability,
    "purchase_orders",
    "purchase_order_reads",
    "orders_area",
  ]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("link", { name: "Pedidos", exact: true }));

  await vi.waitFor(() => expect(window.location.pathname).toBe(path));
});

test("hides the purchase orders from whoever may only manage the lists", async () => {
  const services = ordersServices(["supplier_price_lists", "orders_area"]);
  window.history.pushState(null, "", "/supplier-price-lists");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Listas de proveedores", level: 1 }))
    .toBeVisible();
  expect(screen.getByRole("link", { name: "Pedidos de compra" }).query()).toBeNull();
});

test("sends a user who may not read purchase orders away from them to Mi cuenta", async () => {
  const services = ordersServices(["supplier_price_lists", "orders_area"]);
  window.history.pushState(null, "", "/purchase-orders");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
});

test("sends a user who may not read purchase orders away from an order to Mi cuenta", async () => {
  const services = ordersServices(["supplier_price_lists", "orders_area"]);
  window.history.pushState(null, "", `/purchase-orders/${ORDER_ID}`);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
  expect(services.purchaseOrderScreen.fetchPurchaseOrder).not.toHaveBeenCalled();
});

test.each(["/purchase-orders", `/purchase-orders/${ORDER_ID}`])(
  "sends a session granted managing but not reading purchase orders away from %s to Mi cuenta",
  async (path) => {
    const services = ordersServices(["supplier_price_lists", "purchase_orders", "orders_area"]);
    window.history.pushState(null, "", path);

    const screen = await render(<App help={emptyHelp} services={services} />);

    await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
    expect(services.purchaseOrdersScreen.fetchPurchaseOrders).not.toHaveBeenCalled();
    expect(services.purchaseOrderScreen.fetchPurchaseOrder).not.toHaveBeenCalled();
  },
);

test("opens an order from the purchase orders, and goes back to them from it", async () => {
  const services = ordersServices(["purchase_orders", "purchase_order_reads", "orders_area"]);
  vi.mocked(services.purchaseOrdersScreen.fetchPurchaseOrders).mockResolvedValue({
    kind: "ok",
    value: [DRAFT_SUMMARY],
  });
  vi.mocked(services.purchaseOrderScreen.fetchPurchaseOrder).mockResolvedValue({
    kind: "ok",
    value: { kind: "found", order: DRAFT_ORDER },
  });
  window.history.pushState(null, "", "/purchase-orders");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(
    screen.getByRole("button", { name: "Abrir el pedido de Distribuidora Andina" }),
  );

  await expect
    .element(screen.getByRole("heading", { name: "Pedido a Distribuidora Andina", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe(`/purchase-orders/${ORDER_ID}`);
  expect(services.purchaseOrderScreen.fetchPurchaseOrder).toHaveBeenCalledWith(ORDER_ID);

  await userEvent.click(screen.getByRole("button", { name: "Volver a los pedidos" }));

  await expect
    .element(screen.getByRole("heading", { name: "Pedidos de compra", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/purchase-orders");
});

test("goes to the purchase orders once they are built from the order suggestion", async () => {
  const services = ordersServices([
    "price_comparison",
    "purchase_orders",
    "purchase_order_reads",
    "orders_area",
  ]);
  vi.mocked(services.orderSuggestionScreen.buildPurchaseOrders).mockResolvedValue({
    kind: "ok",
    orderIds: [ORDER_ID],
  });
  vi.mocked(services.purchaseOrdersScreen.fetchPurchaseOrders).mockResolvedValue({
    kind: "ok",
    value: [DRAFT_SUMMARY],
  });
  window.history.pushState(null, "", "/order-suggestion");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("button", { name: "Armar pedidos" }));

  await expect
    .element(screen.getByRole("heading", { name: "Pedidos de compra", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/purchase-orders");
});

test("lists the purchase orders for whoever may only receive them", async () => {
  const services = ordersServices([
    "purchase_order_reads",
    "purchase_order_receipts",
    "orders_area",
  ]);
  vi.mocked(services.purchaseOrdersScreen.fetchPurchaseOrders).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("link", { name: "Pedidos", exact: true }));

  await expect
    .element(screen.getByRole("heading", { name: "Pedidos de compra", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/purchase-orders");
  expect(screen.getByRole("link", { name: "Pedidos de compra" }).query()).not.toBeNull();
});

test("opens an order for whoever may read purchase orders", async () => {
  const services = ordersServices(["purchase_order_reads", "orders_area"]);
  vi.mocked(services.purchaseOrderScreen.fetchPurchaseOrder).mockResolvedValue({
    kind: "ok",
    value: { kind: "found", order: DRAFT_ORDER },
  });
  window.history.pushState(null, "", `/purchase-orders/${ORDER_ID}`);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Pedido a Distribuidora Andina", level: 1 }))
    .toBeVisible();
});

test("sends a user who may not receive orders away from the receipt to Mi cuenta", async () => {
  const services = ordersServices(["purchase_order_reads", "orders_area"]);
  window.history.pushState(null, "", `/purchase-orders/${ORDER_ID}/receive`);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
  expect(services.purchaseOrderReceiveScreen.fetchPurchaseOrderReceiptDraft).not.toHaveBeenCalled();
});

test("opens the receipt of a receivable order from the order, and goes back to the order from it", async () => {
  const services = ordersServices([
    "purchase_order_reads",
    "purchase_order_receipts",
    "purchase_choices",
    "orders_area",
  ]);
  vi.mocked(services.purchaseOrderScreen.fetchPurchaseOrder).mockResolvedValue({
    kind: "ok",
    value: { kind: "found", order: SENT_ORDER },
  });
  vi.mocked(services.purchaseOrderReceiveScreen.fetchPurchaseOrderReceiptDraft).mockResolvedValue({
    kind: "ok",
    value: { kind: "found", draft: RECEIPT_DRAFT },
  });
  window.history.pushState(null, "", `/purchase-orders/${ORDER_ID}`);

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("button", { name: "Recibir pedido" }));

  await expect
    .element(
      screen.getByRole("heading", { name: "Recibir pedido a Distribuidora Andina", level: 1 }),
    )
    .toBeVisible();
  expect(window.location.pathname).toBe(`/purchase-orders/${ORDER_ID}/receive`);
  expect(services.purchaseOrderReceiveScreen.fetchPurchaseOrderReceiptDraft).toHaveBeenCalledWith(
    ORDER_ID,
  );

  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

  await expect
    .element(screen.getByRole("heading", { name: "Pedido a Distribuidora Andina", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe(`/purchase-orders/${ORDER_ID}`);
});
