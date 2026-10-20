import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { FetchAlertsOverviewOutcome } from "../alerts/alerts-api";
import {
  EXTRACTED_ROWS,
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
  "/account",
  "/alerts",
  "/help",
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

    await expect
      .element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 }))
      .toBeVisible();
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

const threeOpenAlerts: FetchAlertsOverviewOutcome = {
  kind: "ok",
  value: {
    critical: { openCount: 1, kinds: ["user_access_increased"] },
    warning: { openCount: 2, kinds: ["user_email_changed"] },
    informational: { openCount: 0, kinds: [] },
  },
};

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
