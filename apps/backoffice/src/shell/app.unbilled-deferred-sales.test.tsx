import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { unbilledDeferredSales } from "../fiscal/test-support/fiscal-task-fixtures";
import { openSession } from "../sessions/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens(["/", "/products", "/inventory", "/fiscal-tasks", "/account"]);

beforeEach(resetPageState);

const PILL = "3 ventas diferidas sin facturar · la más vieja de hace 6 días";

function servicesFor(capabilities: Capability[]) {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Lucía Ferreyra",
        isAdministrator: false,
        capabilities,
      }),
    ),
  });
  vi.mocked(services.unbilledDeferredSalesPill.fetchUnbilledDeferredSales).mockResolvedValue({
    kind: "ok",
    value: unbilledDeferredSales,
  });
  return services;
}

test.each([
  ["the home area", "/", "Inicio", []],
  ["the catalog area", "/products", "Productos", ["catalog_area", "products_and_categories"]],
  ["the stock area", "/inventory", "Saldos", ["stock_area", "stock_balances"]],
] as const)(
  "counts the unbilled deferred sales in the top bar of %s",
  async (_area, path, heading, capabilities) => {
    const services = servicesFor([...capabilities, "fiscal_information"]);
    window.history.pushState(null, "", path);

    const screen = await render(<App help={emptyHelp} services={services} />);

    await expect.element(screen.getByRole("link", { name: PILL })).toBeVisible();
    await expect.element(screen.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  },
);

test("opens the fiscal tasks from the count", async () => {
  const services = servicesFor(["stock_area", "stock_balances", "fiscal_information"]);
  window.history.pushState(null, "", "/inventory");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("link", { name: PILL }));

  await expect.poll(() => window.location.pathname).toBe("/fiscal-tasks");
});

test("hides the count, and never asks for it, from a user who cannot see fiscal information", async () => {
  const services = servicesFor(["stock_area", "stock_balances"]);
  window.history.pushState(null, "", "/inventory");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { level: 1, name: "Saldos" })).toBeVisible();
  expect(screen.getByRole("link", { name: PILL }).query()).toBeNull();
  expect(services.unbilledDeferredSalesPill.fetchUnbilledDeferredSales).not.toHaveBeenCalled();
});

test("hides the count when no deferred sale is unbilled", async () => {
  const services = servicesFor(["stock_area", "stock_balances", "fiscal_information"]);
  vi.mocked(services.unbilledDeferredSalesPill.fetchUnbilledDeferredSales).mockResolvedValue({
    kind: "ok",
    value: { count: 0, oldest: null },
  });
  window.history.pushState(null, "", "/inventory");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .poll(
      () =>
        vi.mocked(services.unbilledDeferredSalesPill.fetchUnbilledDeferredSales).mock.calls.length,
    )
    .toBe(1);
  expect(screen.getByText("ventas diferidas sin facturar").query()).toBeNull();
});
