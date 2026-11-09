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
  ONLY_DISCARD,
  READ_LIST,
  reviewOf,
} from "../purchasing/test-support/supplier-price-lists";
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
  "/purchase-orders/$orderId",
  "/purchase-orders/$orderId/receive",
  "/supplier-price-lists/$listId",
  "/suppliers",
  "/suppliers/price-lists",
  "/purchases",
  "/freights",
]);

beforeEach(resetPageState);

function railLink(screen: Awaited<ReturnType<typeof render>>) {
  return screen.getByRole("navigation", { name: "Áreas" }).getByRole("link", { name: "Compras" });
}

function purchasingServices(capabilities: Capability[], { inPurchasingArea = true } = {}) {
  const sessionCapabilities: Capability[] =
    capabilities.length > 0 && inPurchasingArea
      ? ["purchasing_area", ...capabilities]
      : capabilities;
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Villalba",
        isAdministrator: false,
        capabilities: sessionCapabilities,
      }),
    ),
  });
  vi.mocked(services.ownCredentialsSection.fetchPasskeys).mockResolvedValue({
    kind: "ok",
    value: [],
  });
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

test("opens Proveedores from the rail's Compras item, listing only that section", async () => {
  const services = purchasingServices(["supplier_price_lists"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(railLink(screen));

  await expect
    .element(screen.getByRole("heading", { name: "Proveedores", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/suppliers/price-lists");
  const links = screen
    .getByRole("navigation", { name: "Compras" })
    .getByRole("link")
    .elements()
    .map((link) => link.textContent);
  expect(links).toEqual(["Proveedores"]);
  await expect.element(railLink(screen)).toHaveAttribute("aria-current", "page");
});

test("hides the Compras item in the rail for a user without a purchasing permission", async () => {
  const services = purchasingServices(["stock_area", "stock_balances"], {
    inPurchasingArea: false,
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(railLink(screen).query()).toBeNull();
});

test("shows the Compras item to an Administrator, with every section in order", async () => {
  const services = purchasingServices([]);
  vi.mocked(services.fetchSession).mockResolvedValue(openSession());
  window.history.pushState(null, "", "/suppliers");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(railLink(screen)).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Proveedores", level: 1 }))
    .toBeVisible();
  const links = screen
    .getByRole("navigation", { name: "Compras" })
    .getByRole("link")
    .elements()
    .map((link) => link.textContent);
  expect(links).toEqual(["Proveedores", "Pedidos", "Compras", "Flete"]);
});

test.each([
  ["suppliers", ["Proveedores"]],
  ["supplier_price_lists", ["Proveedores"]],
  ["purchases", ["Compras"]],
  ["freights", ["Flete"]],
] as const)(
  "lists only the sections %s allows in the section column",
  async (capability, labels) => {
    const services = purchasingServices([capability]);
    window.history.pushState(null, "", "/help");
    const screen = await render(<App help={emptyHelp} services={services} />);

    await userEvent.click(railLink(screen));

    await expect.element(screen.getByRole("navigation", { name: "Compras" })).toBeVisible();
    const links = screen
      .getByRole("navigation", { name: "Compras" })
      .getByRole("link")
      .elements()
      .map((link) => link.textContent);
    expect(links).toEqual(labels);
  },
);

test.each([
  ["purchases", "/purchases"],
  ["freights", "/freights"],
] as const)(
  "opens %s's section from the rail's Compras item when it is all the user may open",
  async (capability, path) => {
    const services = purchasingServices([capability]);
    vi.mocked(services.purchasesListScreen.fetchPurchases).mockResolvedValue({
      kind: "ok",
      value: [],
    });
    vi.mocked(services.freightsListScreen.fetchFreights).mockResolvedValue({
      kind: "ok",
      value: { items: [], count: 0, totalCents: 0 },
    });
    window.history.pushState(null, "", "/help");
    const screen = await render(<App help={emptyHelp} services={services} />);

    await userEvent.click(railLink(screen));

    await vi.waitFor(() => expect(window.location.pathname).toBe(path));
  },
);

test.each([
  ["/suppliers", "purchases"],
  ["/suppliers/price-lists", "purchases"],
  ["/purchases", "suppliers"],
  ["/purchases/new", "suppliers"],
  ["/freights", "suppliers"],
  ["/supplier-price-lists", "purchases"],
  [`/supplier-price-lists/${READ_LIST.id}`, "suppliers"],
] as const)("sends a user who may not open %s to Mi cuenta", async (path, capability) => {
  const services = purchasingServices([capability]);
  window.history.pushState(null, "", path);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
});

test("redirects the old supplier price lists address to the tab, keeping its search", async () => {
  const services = purchasingServices(["supplier_price_lists"]);
  window.history.pushState(null, "", "/supplier-price-lists?state=EXTRACTED&search=Andina");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("tab", { name: "Listas de precios", selected: true }))
    .toBeVisible();
  await expect
    .poll(() => window.location.pathname + window.location.search)
    .toBe("/suppliers/price-lists?search=Andina&state=EXTRACTED");
});

test("opens a list's review from the list", async () => {
  const services = purchasingServices(["supplier_price_lists"]);
  window.history.pushState(null, "", "/suppliers/price-lists?state=EXTRACTED");

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

test("goes back to Listas de precios once a list's review is finished", async () => {
  const services = purchasingServices(["supplier_price_lists"]);
  vi.mocked(services.supplierPriceListReviewScreen.fetchSupplierPriceListReview).mockResolvedValue({
    kind: "ok",
    value: { kind: "found", review: reviewOf(READ_LIST, EXTRACTED_ROWS, ONLY_DISCARD) },
  });
  vi.mocked(services.supplierPriceListReviewScreen.discardSupplierPriceList).mockResolvedValue({
    kind: "ok",
  });
  window.history.pushState(null, "", `/supplier-price-lists/${READ_LIST.id}`);

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("button", { name: "Descartar la lista" }));
  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Descartar la lista" }),
  );

  await expect
    .element(screen.getByRole("tab", { name: "Listas de precios", selected: true }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/suppliers/price-lists");
});

test("shows no open alerts count in the list's top bar", async () => {
  const services = purchasingServices([]);
  vi.mocked(services.fetchSession).mockResolvedValue(openSession());
  window.history.pushState(null, "", "/suppliers/price-lists");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Proveedores", level: 1 }))
    .toBeVisible();
  expect(services.homeScreen.fetchAlertsOverview).not.toHaveBeenCalled();
  expect(screen.getByText(/alertas? abiertas?/).query()).toBeNull();
});

test("lists Pedidos beside the supplier price lists for whoever compares prices", async () => {
  const services = purchasingServices(["supplier_price_lists", "price_comparison"]);
  window.history.pushState(null, "", "/suppliers/price-lists");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Proveedores", level: 1 }))
    .toBeVisible();
  const links = screen
    .getByRole("navigation", { name: "Compras" })
    .getByRole("link")
    .elements()
    .map((link) => link.textContent);
  expect(links).toEqual(["Proveedores", "Pedidos"]);
});

test.each(["/purchase-orders/comparison", "/purchase-orders/suggestion"])(
  "sends a user who may not compare prices away from %s to Mi cuenta",
  async (path) => {
    const services = purchasingServices(["supplier_price_lists", "purchase_order_reads"]);
    window.history.pushState(null, "", path);

    const screen = await render(<App help={emptyHelp} services={services} />);

    await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
  },
);

test("hides the purchase orders from whoever may only manage the lists", async () => {
  const services = purchasingServices(["supplier_price_lists"]);
  window.history.pushState(null, "", "/suppliers/price-lists");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Proveedores", level: 1 }))
    .toBeVisible();
  expect(screen.getByRole("link", { name: "Pedidos" }).query()).toBeNull();
});

test("sends a user who may not read purchase orders away from them to Mi cuenta", async () => {
  const services = purchasingServices(["supplier_price_lists"]);
  window.history.pushState(null, "", "/purchase-orders");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
});

test("sends a user who may not read purchase orders away from an order to Mi cuenta", async () => {
  const services = purchasingServices(["supplier_price_lists"]);
  window.history.pushState(null, "", `/purchase-orders/${ORDER_ID}`);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
  expect(services.purchaseOrderScreen.fetchPurchaseOrder).not.toHaveBeenCalled();
});

test.each(["/purchase-orders", `/purchase-orders/${ORDER_ID}`])(
  "sends a session granted managing but not reading purchase orders away from %s to Mi cuenta",
  async (path) => {
    const services = purchasingServices(["supplier_price_lists", "purchase_orders"]);
    window.history.pushState(null, "", path);

    const screen = await render(<App help={emptyHelp} services={services} />);

    await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
    expect(services.purchaseOrdersScreen.fetchPurchaseOrders).not.toHaveBeenCalled();
    expect(services.purchaseOrderScreen.fetchPurchaseOrder).not.toHaveBeenCalled();
  },
);

test("opens an order from the purchase orders, and goes back to them from it", async () => {
  const services = purchasingServices(["purchase_orders", "purchase_order_reads"]);
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

  await expect.element(screen.getByRole("heading", { name: "Pedidos", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/purchase-orders");
});

test("goes to the purchase orders once they are built from the order suggestion", async () => {
  const services = purchasingServices([
    "price_comparison",
    "purchase_orders",
    "purchase_order_reads",
  ]);
  vi.mocked(services.orderSuggestionScreen.buildPurchaseOrders).mockResolvedValue({
    kind: "ok",
    orderIds: [ORDER_ID],
  });
  vi.mocked(services.purchaseOrdersScreen.fetchPurchaseOrders).mockResolvedValue({
    kind: "ok",
    value: [DRAFT_SUMMARY],
  });
  window.history.pushState(null, "", "/purchase-orders/suggestion");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("button", { name: "Armar pedidos" }));

  await expect.element(screen.getByRole("heading", { name: "Pedidos", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/purchase-orders");
});

test("lists the purchase orders for whoever may only receive them", async () => {
  const services = purchasingServices(["purchase_order_reads", "purchase_order_receipts"]);
  vi.mocked(services.purchaseOrdersScreen.fetchPurchaseOrders).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(railLink(screen));

  await expect.element(screen.getByRole("heading", { name: "Pedidos", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/purchase-orders");
  expect(screen.getByRole("link", { name: "Pedidos" }).query()).not.toBeNull();
});

test("opens an order for whoever may read purchase orders", async () => {
  const services = purchasingServices(["purchase_order_reads"]);
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
  const services = purchasingServices(["purchase_order_reads"]);
  window.history.pushState(null, "", `/purchase-orders/${ORDER_ID}/receive`);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
  expect(services.purchaseOrderReceiveScreen.fetchPurchaseOrderReceiptDraft).not.toHaveBeenCalled();
});

test("opens the receipt of a receivable order from the order, and goes back to the order from it", async () => {
  const services = purchasingServices([
    "purchase_order_reads",
    "purchase_order_receipts",
    "purchase_choices",
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

test.each([
  ["/purchase-orders", "purchase_order_reads", "Pedidos de compra"],
  ["/purchases", "purchases", "Compras"],
  ["/freights", "freights", "Fletes"],
  ["/suppliers/price-lists", "supplier_price_lists", "Listas de proveedores"],
] as const)(
  "clears the supplier filter of %s from the address when its filter is pressed",
  async (path, capability, tableName) => {
    const services = purchasingServices([capability]);
    vi.mocked(services.purchaseOrdersScreen.fetchPurchaseOrders).mockResolvedValue({
      kind: "ok",
      value: [],
    });
    vi.mocked(services.purchasesListScreen.fetchPurchases).mockResolvedValue({
      kind: "ok",
      value: [],
    });
    const supplier = READ_LIST.supplier;
    vi.mocked(services.supplierPriceListsScreen.fetchSupplierPriceLists).mockResolvedValue({
      kind: "ok",
      value: [READ_LIST],
    });
    window.history.pushState(null, "", `${path}?supplier=${supplier.id}`);
    const screen = await render(<App help={emptyHelp} services={services} />);
    await expect.element(screen.getByRole("table", { name: tableName })).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: /^Proveedor/ }));

    await expect.poll(() => window.location.pathname + window.location.search).toBe(path);
  },
);

test.each([
  ["/purchase-orders", "purchase_order_reads", "Pedidos de compra"],
  ["/purchases", "purchases", "Compras"],
  ["/freights", "freights", "Fletes"],
  ["/suppliers/price-lists", "supplier_price_lists", "Listas de proveedores"],
] as const)(
  "drops a supplier that is not a supplier's id from the address of %s, without adding a history entry",
  async (path, capability, tableName) => {
    const services = purchasingServices([capability]);
    window.history.pushState(null, "", "/help");
    window.history.pushState(null, "", `${path}?supplier=andina`);
    const historyLength = window.history.length;

    const screen = await render(<App help={emptyHelp} services={services} />);

    await expect.element(screen.getByRole("table", { name: tableName })).toBeVisible();
    await expect.poll(() => window.location.pathname + window.location.search).toBe(path);
    expect(window.history.length).toBe(historyLength);
    expect(screen.getByRole("button", { name: /^Proveedor/ }).query()).toBeNull();
  },
);

test.each([
  ["/purchase-orders", "purchase_order_reads", "Pedidos de compra"],
  ["/purchases", "purchases", "Compras"],
  ["/freights", "freights", "Fletes"],
  ["/suppliers/price-lists", "supplier_price_lists", "Listas de proveedores"],
] as const)(
  "writes the supplier of the address of %s in lowercase",
  async (path, capability, tableName) => {
    const services = purchasingServices([capability]);
    const supplierId = READ_LIST.supplier.id;
    window.history.pushState(null, "", `${path}?supplier=${supplierId.toUpperCase()}`);

    const screen = await render(<App help={emptyHelp} services={services} />);

    await expect.element(screen.getByRole("table", { name: tableName })).toBeVisible();
    await expect
      .poll(() => window.location.pathname + window.location.search)
      .toBe(`${path}?supplier=${supplierId}`);
  },
);
