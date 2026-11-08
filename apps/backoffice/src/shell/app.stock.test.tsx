import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { openSession } from "../sessions/test-support/open-session";
import { expiringLotList } from "../stock/test-support/expiring-lots-fixtures";
import { stockBalanceList } from "../stock/test-support/stock-fixtures";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

const PAST_ACTIVITY_THROTTLE_WINDOW_MS = 120_000;

opensOnlyScreens([
  "/",
  "/freights",
  "/help",
  "/purchases",
  "/purchases/new",
  "/stock",
  "/stock/expiries",
  "/stock/movements",
  "/suppliers",
]);

beforeEach(resetPageState);

function stockServices(capabilities: Capability[]) {
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
  vi.mocked(services.stockBalancesScreen.fetchStockBalances).mockResolvedValue({
    kind: "ok",
    value: stockBalanceList([]),
  });
  vi.mocked(services.stockMovementsScreen.fetchStockMovements).mockResolvedValue({
    kind: "ok",
    value: { movements: [] },
  });
  vi.mocked(services.expiringLotsScreen.fetchExpiringLots).mockResolvedValue({
    kind: "ok",
    value: expiringLotList([]),
  });
  vi.mocked(services.suppliersListScreen.fetchSuppliers).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  vi.mocked(services.purchasesListScreen.fetchPurchases).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  vi.mocked(services.freightsListScreen.fetchFreights).mockResolvedValue({
    kind: "ok",
    value: { items: [], count: 0, totalCents: 0 },
  });
  vi.mocked(services.newPurchaseScreen.fetchPurchaseChoices).mockResolvedValue({
    kind: "ok",
    value: { suppliers: [], products: [], today: "2026-09-16" },
  });
  return services;
}

const SECTION_LABELS = ["Stock", "Proveedores", "Compras", "Flete"];

function location() {
  return window.location.pathname + window.location.search;
}

function railLink(screen: Awaited<ReturnType<typeof render>>) {
  return screen.getByRole("navigation", { name: "Áreas" }).getByRole("link", { name: "Stock" });
}

function sectionLabels(screen: Awaited<ReturnType<typeof render>>) {
  return screen
    .getByRole("navigation", { name: "Stock" })
    .getByRole("link")
    .elements()
    .map((link) => link.textContent);
}

test("opens Stock from the rail with its three tabs for a person with every stock capability", async () => {
  const services = stockServices([
    "stock_area",
    "stock_balances",
    "stock_expiries",
    "stock_counts",
    "stock_movements",
  ]);
  window.history.pushState(null, "", "/help");
  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.click(railLink(screen));

  await expect.element(screen.getByRole("heading", { name: "Stock", level: 1 })).toBeVisible();
  expect(location()).toBe("/stock");
  expect(document.title).toBe("Stock · Puro Sur");
  const tabs = screen.getByRole("tablist", { name: "Secciones de Stock" });
  await expect.element(tabs.getByRole("tab", { name: "Saldos", selected: true })).toBeVisible();
  for (const [index, name] of ["Saldos", "Vencimientos", "Movimientos"].entries()) {
    await expect.element(tabs.getByRole("tab").nth(index)).toHaveAccessibleName(name);
  }
  await expect.element(railLink(screen)).toHaveAttribute("aria-current", "page");
});

test("shows an Administrator the three tabs of Stock", async () => {
  const services = stockServices([]);
  vi.mocked(services.fetchSession).mockResolvedValue(openSession());
  window.history.pushState(null, "", "/stock");

  const screen = await render(<App help={emptyHelp} services={services} />);

  const tabs = screen.getByRole("tablist", { name: "Secciones de Stock" });
  await expect.element(tabs.getByRole("tab", { name: "Saldos" })).toBeVisible();
  await expect.element(tabs.getByRole("tab", { name: "Vencimientos" })).toBeVisible();
  await expect.element(tabs.getByRole("tab", { name: "Movimientos" })).toBeVisible();
});

test("shows the tab's list under the page's one title, with no title of its own", async () => {
  const services = stockServices(["stock_area", "stock_balances"]);
  window.history.pushState(null, "", "/stock");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("table", { name: "Saldos" })).toBeVisible();
  expect(screen.getByRole("heading", { level: 1 }).elements()).toHaveLength(1);
  expect(screen.getByRole("heading", { name: "Saldos" }).query()).toBeNull();
});

test.each([
  ["Vencimientos", "/stock/expiries", "Vencimientos"],
  ["Movimientos", "/stock/movements", "Ajustes y pérdidas"],
] as const)("opens %s from its tab", async (tab, path, table) => {
  const services = stockServices([
    "stock_area",
    "stock_balances",
    "stock_expiries",
    "stock_movements",
  ]);
  window.history.pushState(null, "", "/stock");
  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.click(screen.getByRole("tab", { name: tab }));

  await expect.element(screen.getByRole("table", { name: table })).toBeVisible();
  expect(location()).toBe(path);
  await expect.element(screen.getByRole("tab", { name: tab, selected: true })).toBeVisible();
});

test.each([
  ["stock_balances", "/stock", ["Saldos"]],
  ["stock_expiries", "/stock/expiries", ["Vencimientos"]],
  ["stock_counts", "/stock/movements", ["Movimientos"]],
  ["stock_movements", "/stock/movements", ["Movimientos"]],
] as const)(
  "opens only the tab of %s, as the default, from the rail's Stock item",
  async (capability, path, tabs) => {
    const services = stockServices([capability, "stock_area"]);
    window.history.pushState(null, "", "/help");
    const screen = await render(<App help={emptyHelp} services={services} />);

    await userEvent.click(railLink(screen));

    await expect.element(screen.getByRole("heading", { name: "Stock", level: 1 })).toBeVisible();
    await expect.poll(location).toBe(path);
    const tabList = screen.getByRole("tablist", { name: "Secciones de Stock" });
    expect(tabList.getByRole("tab").elements()).toHaveLength(tabs.length);
    await expect.element(tabList.getByRole("tab").first()).toHaveAccessibleName(tabs[0]);
  },
);

test("shows the page without tabs to a person with only the initial inventory capability", async () => {
  const services = stockServices(["initial_inventory", "stock_area"]);
  window.history.pushState(null, "", "/stock");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Stock", level: 1 })).toBeVisible();
  expect(screen.getByRole("tablist").query()).toBeNull();
  expect(location()).toBe("/stock");
});

test.each([
  ["/stock", "stock_expiries", "/stock/expiries"],
  ["/stock/expiries", "stock_balances", "/stock"],
  ["/stock/movements", "stock_balances", "/stock"],
  ["/stock", "stock_counts", "/stock/movements"],
] as const)(
  "sends a person who may not open the tab at %s, holding only %s, to their first tab",
  async (path, capability, first) => {
    const services = stockServices([capability, "stock_area"]);
    window.history.pushState(null, "", path);

    const screen = await render(<App help={emptyHelp} services={services} />);

    await expect.element(screen.getByRole("heading", { name: "Stock", level: 1 })).toBeVisible();
    await expect.poll(location).toBe(first);
  },
);

test.each([
  ["/inventory?search=miel", "/stock?search=miel"],
  ["/expiring-lots?expiry=expired", "/stock/expiries?expiry=expired"],
  ["/inventory-counts?period=7&search=miel", "/stock/movements?period=7&search=miel&type=count"],
  [
    "/inventory-adjustments?period=90&search=miel",
    "/stock/movements?period=90&search=miel&type=adjustment%2Closs",
  ],
  ["/initial-inventory", "/stock?register=initial-inventory"],
] as const)("redirects the old address %s to %s", async (old, current) => {
  const services = stockServices([
    "stock_area",
    "stock_balances",
    "stock_expiries",
    "stock_counts",
    "stock_movements",
    "initial_inventory",
  ]);
  window.history.pushState(null, "", old);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Stock", level: 1 })).toBeVisible();
  await expect.poll(location).toBe(current);
});

test.each([
  ["stock_balances", ["Stock"]],
  ["stock_expiries", ["Stock"]],
  ["stock_counts", ["Stock"]],
  ["stock_movements", ["Stock"]],
  ["initial_inventory", ["Stock"]],
  ["suppliers", ["Proveedores"]],
  ["purchases", ["Compras"]],
  ["freights", ["Flete"]],
] as const)(
  "lists only the sections %s allows in the section column",
  async (capability, labels) => {
    const services = stockServices([capability, "stock_area"]);
    window.history.pushState(null, "", "/help");
    const screen = await render(<App help={emptyHelp} services={services} />);

    await userEvent.click(railLink(screen));

    await expect.element(screen.getByRole("navigation", { name: "Stock" })).toBeVisible();
    expect(sectionLabels(screen)).toEqual(labels);
  },
);

test("lists every section of Stock in that order to an Administrator", async () => {
  const services = stockServices([]);
  vi.mocked(services.fetchSession).mockResolvedValue(openSession());
  window.history.pushState(null, "", "/stock");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Stock", level: 1 })).toBeVisible();
  expect(sectionLabels(screen)).toEqual(SECTION_LABELS);
  const stockLink = screen.getByRole("navigation", { name: "Stock" }).getByRole("link", {
    name: "Stock",
  });
  await expect.element(stockLink).toHaveAttribute("href", "/stock");
  await expect.element(stockLink).toHaveAttribute("aria-current", "page");
});

test("keeps the Stock link of the section column active on every tab", async () => {
  const services = stockServices([]);
  vi.mocked(services.fetchSession).mockResolvedValue(openSession());
  window.history.pushState(null, "", "/stock/movements");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("navigation", { name: "Stock" }).getByRole("link", { name: "Stock" }))
    .toHaveAttribute("aria-current", "page");
});

test.each([
  ["suppliers", "/suppliers"],
  ["purchases", "/purchases"],
  ["freights", "/freights"],
] as const)("opens %s's section from the rail's Stock item", async (capability, path) => {
  const services = stockServices([capability, "stock_area"]);
  window.history.pushState(null, "", "/help");
  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.click(railLink(screen));

  await expect.poll(location).toBe(path);
});

test("lists only the sections a user holds the permission for", async () => {
  const services = stockServices(["stock_balances", "suppliers", "stock_area"]);
  window.history.pushState(null, "", "/suppliers");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Proveedores", level: 1 }))
    .toBeVisible();
  expect(sectionLabels(screen)).toEqual(["Stock", "Proveedores"]);
});

test("confirms a purchase just registered on the purchases list, until it is dismissed", async () => {
  const services = stockServices(["purchases", "stock_area"]);
  window.history.pushState(
    { key: "registered", __TSR_index: 0, purchaseRegistered: true },
    "",
    "/purchases",
  );

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByText("Compra registrada")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));
  await expect.poll(() => screen.getByText("Compra registrada").query()).toBeNull();
  expect(window.history.state).not.toMatchObject({ purchaseRegistered: true });
});

test("opens a new purchase dated the day it is opened", async () => {
  const services = stockServices(["purchases", "stock_area"]);
  window.history.pushState(null, "", "/purchases/new");
  vi.setSystemTime(new Date("2026-09-16T15:00:00.000Z"));
  try {
    const screen = await render(<App help={emptyHelp} services={services} />);

    const date = screen.getByRole("group", { name: /^Fecha de compra/ });
    await expect.element(date).toBeVisible();
    expect(
      date
        .getByRole("spinbutton")
        .all()
        .map((segment) => segment.element().textContent),
    ).toEqual(["16", "9", "2026"]);
  } finally {
    vi.useRealTimers();
  }
});

test("hides the Stock item in the rail for a user without a stock permission", async () => {
  const services = stockServices(["prices_area", "catalog_area"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(railLink(screen).query()).toBeNull();
});

test.each([
  ["/stock", "suppliers"],
  ["/stock/expiries", "suppliers"],
  ["/stock/movements", "suppliers"],
  ["/inventory", "suppliers"],
  ["/expiring-lots", "suppliers"],
  ["/inventory-counts", "suppliers"],
  ["/inventory-adjustments", "suppliers"],
  ["/initial-inventory", "suppliers"],
  ["/suppliers", "purchases"],
  ["/purchases", "suppliers"],
  ["/purchases/new", "suppliers"],
  ["/freights", "suppliers"],
] as const)("sends a user who may not open %s to Mi cuenta", async (path, capability) => {
  const services = stockServices([capability, "stock_area"]);
  window.history.pushState(null, "", path);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
});

test("offers the kinds of stock movement real use of the open tab reports the user may now record", async () => {
  const lossesOnly = openSession({
    userId: "user-2",
    displayName: "Grace Villalba",
    isAdministrator: false,
    capabilities: ["stock_losses", "stock_adjustments", "stock_movements", "stock_area"],
    stockMovementKinds: ["loss"],
  });
  const services = stockServices([]);
  vi.mocked(services.fetchSession).mockResolvedValue(lossesOnly);
  window.history.pushState(null, "", "/stock/movements");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("button", { name: "Cargar pérdida" })).toBeVisible();

  vi.mocked(services.fetchSession).mockResolvedValue({
    ...lossesOnly,
    stockMovementKinds: ["loss", "adjustment"],
  });
  vi.setSystemTime(Date.now() + PAST_ACTIVITY_THROTTLE_WINDOW_MS);
  try {
    window.dispatchEvent(new KeyboardEvent("keydown"));

    await expect
      .element(screen.getByRole("button", { name: "Cargar pérdida o ajuste" }))
      .toBeVisible();
  } finally {
    vi.useRealTimers();
  }
});

const STOCK_SCREENS = [
  ["/stock", "Stock"],
  ["/stock/expiries", "Stock"],
  ["/stock/movements", "Stock"],
  ["/suppliers", "Proveedores"],
  ["/purchases", "Compras"],
  ["/purchases/new", "Registrar compra"],
  ["/freights", "Flete"],
] as const;

test.each(STOCK_SCREENS)("shows no open alerts count in %s's top bar", async (path, heading) => {
  const services = stockServices([]);
  vi.mocked(services.fetchSession).mockResolvedValue(openSession());
  window.history.pushState(null, "", path);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
  expect(services.homeScreen.fetchAlertsOverview).not.toHaveBeenCalled();
  expect(screen.getByText(/alertas? abiertas?/).query()).toBeNull();
});
