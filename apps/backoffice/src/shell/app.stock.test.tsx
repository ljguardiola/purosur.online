import type { Capability } from "@purosur/domain";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { openSession } from "../access/test-support/open-session";
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
]);

beforeEach(resetPageState);

afterEach(resetPageState);

function stockServices(capabilities: Capability[]) {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
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
  return services;
}

test.each([
  ["stock_balances", "Saldos", "/inventory"],
  ["stock_counts", "Recuentos", "/inventory-counts"],
  ["stock_losses", "Ajustes y pérdidas", "/inventory-adjustments"],
  ["stock_adjustments", "Ajustes y pérdidas", "/inventory-adjustments"],
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
    const labels = ["Saldos", "Recuentos", "Ajustes y pérdidas"].filter(
      (label) => sections.getByRole("link", { name: label }).query() !== null,
    );
    expect(labels).toEqual([heading]);
  },
);

test("lists Saldos, Recuentos and Ajustes y pérdidas in that order to an Administrator", async () => {
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
  expect(links).toEqual(["Saldos", "Recuentos", "Ajustes y pérdidas"]);
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
] as const)("sends a user who may not open %s to Mi cuenta", async (path, capability) => {
  const services = stockServices([capability, "stock_area"]);
  window.history.pushState(null, "", path);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
});

test("offers the kinds of stock movement real use of the open tab reports the user may now record", async () => {
  const lossesOnly = openSession({
    userId: "user-2",
    displayName: "Grace Hopper",
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
