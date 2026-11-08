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

opensOnlyScreens(["/", "/help", "/suppliers", "/suppliers/price-lists"]);

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

function tabNames(screen: Awaited<ReturnType<typeof render>>) {
  return screen
    .getByRole("tablist", { name: "Secciones de Proveedores" })
    .getByRole("tab")
    .elements()
    .map((tab) => tab.textContent);
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
  expect(tabNames(screen)).toEqual(["Proveedores", "Listas de precios"]);
  await expect.element(screen.getByRole("table", { name: "Proveedores" })).toBeVisible();
});

test("shows both tabs to an Administrator", async () => {
  const services = suppliersServices([]);
  vi.mocked(services.fetchSession).mockResolvedValue(openSession());
  window.history.pushState(null, "", "/suppliers");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Listas de precios" })).toBeVisible();
  expect(tabNames(screen)).toEqual(["Proveedores", "Listas de precios"]);
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
  await expect.element(screen.getByRole("button", { name: "Cargar una lista" })).toBeVisible();
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
    expect(tabNames(screen)).toEqual([tab]);
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
