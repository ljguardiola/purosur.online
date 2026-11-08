import type { Capability } from "@purosur/domain";
import { ANOTHER_FICTIONAL_CUIT, FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { READ_LIST } from "../purchasing/test-support/supplier-price-lists";
import { suppliersWithCuits } from "../purchasing/test-support/suppliers";
import { openSession } from "../sessions/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens([
  "/",
  "/help",
  "/suppliers",
  "/suppliers/price-lists",
  "/purchase-orders",
  "/purchases",
  "/freights",
]);

beforeEach(resetPageState);

const { andina } = suppliersWithCuits(FICTIONAL_CUIT, ANOTHER_FICTIONAL_CUIT);

function suppliersServices(capabilities: Capability[]) {
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
  vi.mocked(services.ownCredentialsSection.fetchPasskeys).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  vi.mocked(services.suppliersListScreen.fetchSuppliers).mockResolvedValue({
    kind: "ok",
    value: [andina],
  });
  vi.mocked(services.supplierPriceListsScreen.fetchSupplierPriceLists).mockResolvedValue({
    kind: "ok",
    value: [READ_LIST],
  });
  return services;
}

function location() {
  return window.location.pathname + window.location.search;
}

async function expectTabs(
  screen: Awaited<ReturnType<typeof render>>,
  label: string,
  names: string[],
) {
  const tabs = screen.getByRole("tablist", { name: label }).getByRole("tab");
  await expect.element(tabs.first()).toBeVisible();
  expect(tabs.elements()).toHaveLength(names.length);
  for (const [index, name] of names.entries()) {
    await expect.element(tabs.nth(index)).toHaveAccessibleName(name);
  }
}

test("opens Proveedores with its two tabs for a person with both capabilities", async () => {
  const services = suppliersServices(["suppliers", "supplier_price_lists"]);
  window.history.pushState(null, "", "/suppliers");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Proveedores", level: 1 }))
    .toBeVisible();
  expect(document.title).toBe("Proveedores · Puro Sur");
  await expect
    .element(screen.getByRole("tab", { name: "Proveedores", selected: true }))
    .toBeVisible();
  await expectTabs(screen, "Secciones de Proveedores", ["Proveedores", "Listas de precios"]);
  await expect.element(screen.getByRole("table", { name: "Proveedores" })).toBeVisible();
});

test("shows both tabs to an Administrator", async () => {
  const services = suppliersServices([]);
  vi.mocked(services.fetchSession).mockResolvedValue(openSession());
  window.history.pushState(null, "", "/suppliers");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Listas de precios" })).toBeVisible();
  await expectTabs(screen, "Secciones de Proveedores", ["Proveedores", "Listas de precios"]);
});

test("opens Listas de precios from its tab, with the lists and their upload action", async () => {
  const services = suppliersServices(["suppliers", "supplier_price_lists"]);
  window.history.pushState(null, "", "/suppliers");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("tab", { name: "Listas de precios" }));

  await expect
    .element(screen.getByRole("tab", { name: "Listas de precios", selected: true }))
    .toBeVisible();
  expect(location()).toBe("/suppliers/price-lists");
  await expect.element(screen.getByRole("table", { name: "Listas de proveedores" })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Subir lista" })).toBeVisible();
  expect(screen.getByRole("heading", { level: 1 }).elements()).toHaveLength(1);
});

test("offers the creation of a supplier on the Proveedores tab", async () => {
  const services = suppliersServices(["suppliers"]);
  window.history.pushState(null, "", "/suppliers");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.click(screen.getByRole("button", { name: "Nuevo proveedor" }));

  await expect.element(screen.getByRole("dialog")).toBeVisible();
});

test.each([
  ["/suppliers", "supplier_price_lists", "/suppliers/price-lists", "Listas de precios"],
  ["/suppliers/price-lists", "suppliers", "/suppliers", "Proveedores"],
] as const)(
  "sends a person who may not open the tab at %s, holding only %s, to their first tab",
  async (path, capability, first, tab) => {
    const services = suppliersServices([capability]);
    window.history.pushState(null, "", path);

    const screen = await render(<App help={emptyHelp} services={services} />);

    await expect
      .element(screen.getByRole("heading", { name: "Proveedores", level: 1 }))
      .toBeVisible();
    await expect.poll(location).toBe(first);
    await expect.element(screen.getByRole("tab", { name: tab, selected: true })).toBeVisible();
    await expectTabs(screen, "Secciones de Proveedores", [tab]);
  },
);

test("opens the page without the tab of a capability the person lacks, keeping the other filters", async () => {
  const services = suppliersServices(["suppliers"]);
  window.history.pushState(null, "", "/suppliers?status=all");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Proveedores" })).toBeVisible();
  expect(screen.getByRole("tab", { name: "Listas de precios" }).query()).toBeNull();
  expect(location()).toBe("/suppliers?status=all");
});

test("opens the supplier's panel when its row is pressed, naming the supplier in the address", async () => {
  const services = suppliersServices([
    "suppliers",
    "supplier_price_lists",
    "purchase_order_reads",
    "purchases",
    "freights",
  ]);
  window.history.pushState(null, "", "/suppliers");
  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.click(screen.getByText(andina.name));

  await expect.element(screen.getByRole("complementary", { name: andina.name })).toBeVisible();
  expect(location()).toBe(`/suppliers?supplier=${andina.id}`);
  await expectTabs(screen, "Secciones del proveedor", [
    "Datos",
    "Listas",
    "Pedidos",
    "Compras",
    "Fletes",
  ]);
});

test("opens the panel of the supplier named in the address, on the tab named", async () => {
  const services = suppliersServices(["suppliers", "supplier_price_lists", "purchases"]);
  window.history.pushState(null, "", `/suppliers?supplier=${andina.id}&tab=lists`);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("complementary", { name: andina.name })).toBeVisible();
  await expect.element(screen.getByRole("tab", { name: "Listas", selected: true })).toBeVisible();
});

test("writes the panel's tab in the address when it is pressed", async () => {
  const services = suppliersServices(["suppliers", "supplier_price_lists", "purchases"]);
  window.history.pushState(null, "", `/suppliers?supplier=${andina.id}`);
  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.click(screen.getByRole("tab", { name: "Compras" }));

  await expect.element(screen.getByRole("tab", { name: "Compras", selected: true })).toBeVisible();
  expect(location()).toBe(`/suppliers?supplier=${andina.id}&tab=purchases`);
});

test("shows no Fletes tab in the panel of a person without the freights capability", async () => {
  const services = suppliersServices(["suppliers", "purchases"]);
  window.history.pushState(null, "", `/suppliers?supplier=${andina.id}`);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("complementary", { name: andina.name })).toBeVisible();
  await expectTabs(screen, "Secciones del proveedor", ["Datos", "Compras"]);
});

test("closes the panel by removing the supplier and the tab from the address", async () => {
  const services = suppliersServices(["suppliers", "purchases"]);
  window.history.pushState(null, "", `/suppliers?supplier=${andina.id}&tab=purchases&status=all`);
  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

  await expect.poll(location).toBe("/suppliers?status=all");
  expect(screen.getByRole("complementary").query()).toBeNull();
});

test("keeps the supplier open while its filters change", async () => {
  const services = suppliersServices(["suppliers"]);
  window.history.pushState(null, "", `/suppliers?supplier=${andina.id}`);
  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.fill(screen.getByPlaceholder("Buscar un proveedor"), "dist");

  await expect.poll(location).toBe(`/suppliers?search=dist&supplier=${andina.id}`);
});

test.each([
  ["lists", "Listas", `/suppliers/price-lists?supplier=${andina.id}`, "Listas de proveedores"],
  ["orders", "Pedidos", `/purchase-orders?supplier=${andina.id}`, "Pedidos de compra"],
  ["purchases", "Compras", `/purchases?supplier=${andina.id}`, "Compras"],
  ["freights", "Fletes", `/freights?period=365&supplier=${andina.id}`, "Fletes"],
] as const)(
  "opens the full list of the panel's %s tab filtered by the supplier when Ver todos is pressed",
  async (tab, tabName, address, tableName) => {
    const services = suppliersServices([
      "suppliers",
      "supplier_price_lists",
      "purchase_order_reads",
      "purchases",
      "freights",
    ]);
    vi.mocked(services.purchaseOrdersScreen.fetchPurchaseOrders).mockResolvedValue({
      kind: "ok",
      value: [],
    });
    vi.mocked(services.purchasesListScreen.fetchPurchases).mockResolvedValue({
      kind: "ok",
      value: [],
    });
    window.history.pushState(null, "", `/suppliers?supplier=${andina.id}&tab=${tab}`);
    const screen = await render(<App help={emptyHelp} services={services} />);
    await expect.element(screen.getByRole("tab", { name: tabName, selected: true })).toBeVisible();

    await userEvent.click(screen.getByRole("link", { name: "Ver todos" }));

    await expect.element(screen.getByRole("table", { name: tableName })).toBeVisible();
    expect(location()).toBe(address);
  },
);
