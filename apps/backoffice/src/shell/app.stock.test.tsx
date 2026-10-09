import type { Capability } from "@purosur/domain";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { openSession } from "../sessions/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

const PAST_ACTIVITY_THROTTLE_WINDOW_MS = 120_000;

opensOnlyScreens([
  "/",
  "/account",
  "/help",
  "/inventory",
  "/inventory-adjustments",
  "/inventory-counts",
  "/purchase-packagings",
  "/suppliers",
]);

beforeEach(resetPageState);

afterEach(resetPageState);

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
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.stockBalancesScreen.fetchStockBalances).mockResolvedValue({
    kind: "ok",
    value: { products: [] },
  });
  vi.mocked(services.stockCountsScreen.fetchStockCounts).mockResolvedValue({
    kind: "ok",
    value: { counts: [] },
  });
  vi.mocked(services.stockMovementsScreen.fetchStockMovements).mockResolvedValue({
    kind: "ok",
    value: { movements: [] },
  });
  vi.mocked(services.suppliersListScreen.fetchSuppliers).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  vi.mocked(services.packagingsListScreen.fetchPackagings).mockResolvedValue({
    kind: "ok",
    value: { packagings: [], products: [] },
  });
  return services;
}

const SECTION_LABELS = [
  "Saldos",
  "Recuentos",
  "Ajustes y pérdidas",
  "Proveedores",
  "Presentaciones de compra",
];

test.each([
  ["stock_balances", "Saldos", "/inventory"],
  ["stock_counts", "Recuentos", "/inventory-counts"],
  ["stock_losses", "Ajustes y pérdidas", "/inventory-adjustments"],
  ["stock_adjustments", "Ajustes y pérdidas", "/inventory-adjustments"],
  ["suppliers", "Proveedores", "/suppliers"],
  ["purchase_packagings", "Presentaciones de compra", "/purchase-packagings"],
] as const)(
  "opens only %s's section from the rail's Stock item: %s",
  async (capability, heading, path) => {
    const services = stockServices(
      capability === "stock_losses" || capability === "stock_adjustments"
        ? [capability, "stock_movements", "stock_area"]
        : [capability, "stock_area"],
    );
    window.history.pushState(null, "", "/help");

    const screen = await render(<App help={emptyHelp} services={services} />);
    await userEvent.click(screen.getByRole("link", { name: "Stock" }));

    await expect.element(screen.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    expect(window.location.pathname).toBe(path);
    const sections = screen.getByRole("navigation", { name: "Stock" });
    const labels = SECTION_LABELS.filter(
      (label) => sections.getByRole("link", { name: label }).query() !== null,
    );
    expect(labels).toEqual([heading]);
  },
);

test("lists every section of Stock in that order to an Administrator", async () => {
  const services = stockServices([]);
  vi.mocked(services.fetchSession).mockResolvedValue(openSession());
  window.history.pushState(null, "", "/inventory");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Saldos", level: 1 })).toBeVisible();
  const links = screen
    .getByRole("navigation", { name: "Stock" })
    .getByRole("link")
    .elements()
    .map((link) => link.textContent);
  expect(links).toEqual(SECTION_LABELS);
});

test("lists only the sections a user holds the permission for", async () => {
  const services = stockServices(["stock_balances", "suppliers", "stock_area"]);
  window.history.pushState(null, "", "/suppliers");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Proveedores", level: 1 }))
    .toBeVisible();
  const links = screen
    .getByRole("navigation", { name: "Stock" })
    .getByRole("link")
    .elements()
    .map((link) => link.textContent);
  expect(links).toEqual(["Saldos", "Proveedores"]);
});

test("hides the Stock item in the rail for a user without a stock permission", async () => {
  const services = stockServices(["prices_area", "catalog_area"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Stock" }).query()).toBeNull();
});

test.each([
  ["/inventory", "stock_counts"],
  ["/inventory-counts", "stock_balances"],
  ["/inventory-adjustments", "stock_counts"],
  ["/suppliers", "purchase_packagings"],
  ["/purchase-packagings", "suppliers"],
] as const)("sends a user who may not open %s to Mi cuenta", async (path, capability) => {
  const services = stockServices([capability, "stock_area"]);
  window.history.pushState(null, "", path);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
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
  window.history.pushState(null, "", "/inventory-adjustments");
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
