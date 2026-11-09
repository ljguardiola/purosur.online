import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ORDER_SUGGESTION } from "../purchasing/test-support/order-suggestion";
import {
  DRAFT_SUMMARY,
  ORDER_ID,
  RECEIPT_DRAFT,
  SENT_ORDER,
  SENT_ORDER_WITH_RECEIPTS,
} from "../purchasing/test-support/purchase-orders";
import { PRICE_COMPARISON } from "../purchasing/test-support/supplier-price-comparison";
import { openSession } from "../sessions/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens([
  "/",
  "/help",
  "/purchase-orders",
  "/purchase-orders/suggestion",
  "/purchase-orders/comparison",
  "/purchase-orders/$orderId/receive",
]);

beforeEach(async () => {
  await page.viewport(1280, 900);
  resetPageState();
});

function purchaseOrdersServices(capabilities: Capability[]) {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Villalba",
        isAdministrator: false,
        capabilities: ["purchasing_area", ...capabilities],
      }),
    ),
  });
  vi.mocked(services.ownCredentialsSection.fetchPasskeys).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  vi.mocked(services.purchaseOrdersScreen.fetchPurchaseOrders).mockResolvedValue({
    kind: "ok",
    value: [DRAFT_SUMMARY],
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

function location() {
  return window.location.pathname + window.location.search;
}

async function expectTabs(screen: Awaited<ReturnType<typeof render>>, names: string[]) {
  const tabs = screen.getByRole("tablist", { name: "Secciones de Pedidos" }).getByRole("tab");
  await expect.element(tabs.first()).toBeVisible();
  expect(tabs.elements()).toHaveLength(names.length);
  for (const [index, name] of names.entries()) {
    await expect.element(tabs.nth(index)).toHaveAccessibleName(name);
  }
}

test("opens Pedidos with its three tabs for a person with every purchasing capability", async () => {
  const services = purchaseOrdersServices([
    "purchase_orders",
    "purchase_order_reads",
    "purchase_order_receipts",
    "price_comparison",
  ]);
  window.history.pushState(null, "", "/purchase-orders");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Pedidos", level: 1 })).toBeVisible();
  expect(document.title).toBe("Pedidos · Puro Sur");
  await expect.element(screen.getByRole("tab", { name: "Pedidos", selected: true })).toBeVisible();
  await expectTabs(screen, ["Pedidos", "Sugerir pedido", "Comparar precios"]);
  await expect.element(screen.getByRole("table", { name: "Pedidos de compra" })).toBeVisible();
  expect(screen.getByRole("heading", { level: 1 }).elements()).toHaveLength(1);
});

test("opens Sugerir pedido and Comparar precios from their tabs", async () => {
  const services = purchaseOrdersServices(["purchase_order_reads", "price_comparison"]);
  window.history.pushState(null, "", "/purchase-orders");
  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.click(screen.getByRole("tab", { name: "Sugerir pedido" }));

  await expect.element(screen.getByRole("table", { name: "Sugerencia de pedido" })).toBeVisible();
  expect(location()).toBe("/purchase-orders/suggestion");

  await userEvent.click(screen.getByRole("tab", { name: "Comparar precios" }));

  await expect.element(screen.getByRole("table", { name: "Comparación de precios" })).toBeVisible();
  expect(location()).toBe("/purchase-orders/comparison");
  expect(screen.getByRole("heading", { level: 1 }).elements()).toHaveLength(1);
});

test("opens on Sugerir pedido, without the Pedidos tab, for a person with only price_comparison", async () => {
  const services = purchaseOrdersServices(["price_comparison"]);
  window.history.pushState(null, "", "/purchase-orders");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Pedidos", level: 1 })).toBeVisible();
  await expect
    .element(screen.getByRole("tab", { name: "Sugerir pedido", selected: true }))
    .toBeVisible();
  await expectTabs(screen, ["Sugerir pedido", "Comparar precios"]);
  await expect.poll(location).toBe("/purchase-orders/suggestion");
  expect(services.purchaseOrdersScreen.fetchPurchaseOrders).not.toHaveBeenCalled();
});

test("sends a person with only purchase_order_reads away from the price tabs to Pedidos", async () => {
  const services = purchaseOrdersServices(["purchase_order_reads"]);
  window.history.pushState(null, "", "/purchase-orders/comparison");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("table", { name: "Pedidos de compra" })).toBeVisible();
  await expect.poll(location).toBe("/purchase-orders");
  await expectTabs(screen, ["Pedidos"]);
});

test("shows one Pedidos item in the Compras column, active on every tab", async () => {
  const services = purchaseOrdersServices(["purchase_order_reads", "price_comparison"]);
  window.history.pushState(null, "", "/purchase-orders/comparison");

  const screen = await render(<App help={emptyHelp} services={services} />);

  const links = screen.getByRole("navigation", { name: "Compras" }).getByRole("link");
  await expect.element(links.first()).toBeVisible();
  expect(links.elements().map((link) => link.textContent)).toEqual(["Pedidos"]);
  await expect.element(links.first()).toHaveAttribute("aria-current", "page");
});

test("opens an order's panel from its row, keeping the list and the tabs in view", async () => {
  const services = purchaseOrdersServices(["purchase_orders", "purchase_order_reads"]);
  vi.mocked(services.purchaseOrdersScreen.fetchPurchaseOrder).mockResolvedValue({
    kind: "ok",
    value: { kind: "found", order: SENT_ORDER_WITH_RECEIPTS },
  });
  window.history.pushState(null, "", "/purchase-orders");
  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.click(
    screen.getByRole("button", { name: "Abrir el pedido de Distribuidora Andina" }),
  );

  const panel = screen.getByRole("complementary", { name: "Pedido a Distribuidora Andina" });
  await expect.element(panel).toBeVisible();
  expect(location()).toBe(`/purchase-orders?order=${ORDER_ID}`);
  expect(services.purchaseOrdersScreen.fetchPurchaseOrder).toHaveBeenCalledWith(ORDER_ID);
  await expect.element(panel.getByRole("table", { name: "Líneas del pedido" })).toBeVisible();
  await expect.element(panel.getByRole("button", { name: "Compartir pedido" })).toBeVisible();
  await expect.element(panel.getByRole("button", { name: "Cancelar pedido" })).toBeVisible();
  await expect
    .element(panel.getByRole("heading", { name: "Diferencias de recepción" }))
    .toBeVisible();
  await expect.element(screen.getByRole("table", { name: "Pedidos de compra" })).toBeVisible();
  await expect.element(screen.getByRole("tab", { name: "Pedidos", selected: true })).toBeVisible();
});

test("closing the panel takes the order out of the address", async () => {
  const services = purchaseOrdersServices(["purchase_order_reads"]);
  window.history.pushState(null, "", `/purchase-orders?order=${ORDER_ID}`);
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("complementary", { name: /^Pedido/ })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

  await expect.poll(location).toBe("/purchase-orders");
  expect(screen.getByRole("complementary").query()).toBeNull();
});

test("opens the panel of the order when the old order address is opened", async () => {
  const services = purchaseOrdersServices(["purchase_order_reads"]);
  vi.mocked(services.purchaseOrdersScreen.fetchPurchaseOrder).mockResolvedValue({
    kind: "ok",
    value: { kind: "found", order: { ...SENT_ORDER, id: ORDER_ID } },
  });
  window.history.pushState(null, "", `/purchase-orders/${ORDER_ID}`);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("complementary", { name: "Pedido a Distribuidora Andina" }))
    .toBeVisible();
  await expect.poll(location).toBe(`/purchase-orders?order=${ORDER_ID}`);
  await expect.element(screen.getByRole("table", { name: "Pedidos de compra" })).toBeVisible();
});

test("goes from the panel's Recibir pedido to the receipt, and back to the panel of that order", async () => {
  const services = purchaseOrdersServices(["purchase_order_reads", "purchase_order_receipts"]);
  vi.mocked(services.purchaseOrdersScreen.fetchPurchaseOrder).mockResolvedValue({
    kind: "ok",
    value: { kind: "found", order: { ...SENT_ORDER, id: ORDER_ID } },
  });
  vi.mocked(services.purchaseOrderReceiveScreen.fetchPurchaseOrderReceiptDraft).mockResolvedValue({
    kind: "ok",
    value: { kind: "found", draft: RECEIPT_DRAFT },
  });
  window.history.pushState(null, "", `/purchase-orders?order=${ORDER_ID}`);
  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.click(screen.getByRole("button", { name: "Recibir pedido" }));

  await expect
    .element(
      screen.getByRole("heading", { name: "Recibir pedido a Distribuidora Andina", level: 1 }),
    )
    .toBeVisible();
  expect(location()).toBe(`/purchase-orders/${ORDER_ID}/receive`);

  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

  await expect
    .element(screen.getByRole("complementary", { name: "Pedido a Distribuidora Andina" }))
    .toBeVisible();
  expect(location()).toBe(`/purchase-orders?order=${ORDER_ID}`);
});

test("says the receipt was registered over the panel of the order the person comes back to", async () => {
  const services = purchaseOrdersServices(["purchase_order_reads", "purchase_order_receipts"]);
  vi.mocked(services.purchaseOrdersScreen.fetchPurchaseOrder).mockResolvedValue({
    kind: "ok",
    value: { kind: "found", order: SENT_ORDER_WITH_RECEIPTS },
  });
  window.history.pushState(
    { purchaseOrderReceived: true },
    "",
    `/purchase-orders?order=${ORDER_ID}`,
  );

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByText("Recepción registrada")).toBeVisible();
  await expect
    .element(screen.getByRole("complementary", { name: "Pedido a Distribuidora Andina" }))
    .toBeVisible();
});

test("redirects the old order suggestion address to its tab, keeping its search", async () => {
  const services = purchaseOrdersServices(["purchase_order_reads", "price_comparison"]);
  window.history.pushState(null, "", "/order-suggestion?search=almendras");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("tab", { name: "Sugerir pedido", selected: true }))
    .toBeVisible();
  await expect.poll(location).toBe("/purchase-orders/suggestion?search=almendras");
});

test("redirects the old price comparison address to its tab, keeping its search", async () => {
  const services = purchaseOrdersServices(["purchase_order_reads", "price_comparison"]);
  window.history.pushState(null, "", "/price-comparison?search=almendras");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("tab", { name: "Comparar precios", selected: true }))
    .toBeVisible();
  await expect.poll(location).toBe("/purchase-orders/comparison?search=almendras");
});
