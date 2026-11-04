import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { pendingPurchaseOrdersReport } from "../purchasing/test-support/pending-purchase-orders-report-fixtures";
import { openSession } from "../sessions/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens(["/", "/account", "/help", "/reports", "/reports/pending-purchase-orders"], {
  downloadedInTest: ["/purchase-orders/$orderId"],
});

beforeEach(resetPageState);

function reportsServices(capabilities: Capability[]) {
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
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(
    services.pendingPurchaseOrdersReportScreen.fetchPendingPurchaseOrdersReport,
  ).mockResolvedValue({
    kind: "ok",
    value: pendingPurchaseOrdersReport,
  });
  return services;
}

test("opens the report from the list and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(
    screen.getByRole("main").getByRole("link", { name: "Pedidos pendientes de recibir" }),
  );

  await expect
    .element(screen.getByRole("heading", { name: "Pedidos pendientes de recibir", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/reports/pending-purchase-orders");
  await expect.element(screen.getByText("Granos del Sur")).toBeVisible();
  expect(
    services.pendingPurchaseOrdersReportScreen.fetchPendingPurchaseOrdersReport,
  ).toHaveBeenCalledWith({});
  expect(document.title).toBe("Pedidos pendientes de recibir · Puro Sur");
});

test("offers the report in the reports side column", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/pending-purchase-orders");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(
      screen
        .getByRole("link", { name: "Pedidos pendientes de recibir", includeHidden: false })
        .first(),
    )
    .toBeVisible();
});

test("keeps the period in the URL and asks the cloud for it", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(
    null,
    "",
    "/reports/pending-purchase-orders?from=2026-09-01&to=2026-10-31",
  );

  await render(<App help={emptyHelp} services={services} />);

  await expect
    .poll(() => services.pendingPurchaseOrdersReportScreen.fetchPendingPurchaseOrdersReport)
    .toHaveBeenCalledWith({ from: "2026-09-01", to: "2026-10-31" });
  expect(window.location.search).toBe("?from=2026-09-01&to=2026-10-31");
});

test("sends a user without the reports permission to Mi cuenta", async () => {
  const services = reportsServices(["stock_area"]);
  window.history.pushState(null, "", "/reports/pending-purchase-orders");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(
    services.pendingPurchaseOrdersReportScreen.fetchPendingPurchaseOrdersReport,
  ).not.toHaveBeenCalled();
});

test("opens an order from its row", async () => {
  const services = reportsServices(["reports_area", "purchase_order_reads"]);
  window.history.pushState(null, "", "/reports/pending-purchase-orders");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("button", { name: "Abrir el pedido de Granos del Sur" }));

  await expect
    .poll(() => window.location.pathname)
    .toBe("/purchase-orders/90e00000-0000-4000-8000-0000000000b2");
});

test("offers no way to open an order to a user who may not read orders", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/pending-purchase-orders");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("main").getByText("Granos del Sur")).toBeVisible();
  expect(screen.getByRole("button", { name: /^Abrir el pedido/ }).elements()).toHaveLength(0);
});
