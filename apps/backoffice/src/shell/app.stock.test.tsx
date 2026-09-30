import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { openSession } from "../access/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";

beforeEach(resetPageState);

afterEach(resetPageState);

function stockServices(permissions: string[]) {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        permissions,
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
  ["view_stock_balances", "Saldos", "/stock/balances"],
  ["perform_stock_counts", "Recuentos", "/stock/counts"],
  ["record_stock_losses", "Ajustes y pérdidas", "/stock/adjustments-and-losses"],
  ["adjust_stock", "Ajustes y pérdidas", "/stock/adjustments-and-losses"],
])("opens only %s's section from the rail's Stock item: %s", async (permission, heading, path) => {
  const services = stockServices([permission]);
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
});

test("lists Saldos, Recuentos and Ajustes y pérdidas in that order to an Administrator", async () => {
  const services = stockServices([]);
  vi.mocked(services.fetchSession).mockResolvedValue(openSession());
  window.history.pushState(null, "", "/stock/balances");

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
  const services = stockServices(["manage_prices_and_review"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Stock" }).query()).toBeNull();
});

test.each([
  ["/stock/balances", "perform_stock_counts"],
  ["/stock/counts", "view_stock_balances"],
  ["/stock/adjustments-and-losses", "perform_stock_counts"],
])("sends a user who may not open %s to Mi cuenta", async (path, permission) => {
  const services = stockServices([permission]);
  window.history.pushState(null, "", path);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
});
