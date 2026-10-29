import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { quarterPurchasesReport } from "../purchasing/test-support/purchases-report-fixtures";
import { openSession } from "../sessions/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens(["/", "/account", "/help", "/reports", "/reports/purchases-by-supplier"]);

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
  vi.mocked(services.purchasesReportScreen.fetchPurchasesReport).mockResolvedValue({
    kind: "ok",
    value: quarterPurchasesReport,
  });
  return services;
}

test("opens the report from the list and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(
    screen.getByRole("main").getByRole("link", { name: "Compras por proveedor" }),
  );

  await expect
    .element(screen.getByRole("heading", { name: "Compras por proveedor", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/reports/purchases-by-supplier");
  await expect.element(screen.getByText("Lácteos del Sur")).toBeVisible();
  expect(services.purchasesReportScreen.fetchPurchasesReport).toHaveBeenCalledWith({});
  expect(document.title).toBe("Compras por proveedor · Puro Sur");
});

test("offers the report in the reports side column", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(
      screen.getByRole("link", { name: "Compras por proveedor", includeHidden: false }).first(),
    )
    .toBeVisible();
});

test("keeps the period in the URL and asks the cloud for it", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/purchases-by-supplier?from=2026-09-01&to=2026-10-31");

  await render(<App help={emptyHelp} services={services} />);

  await expect
    .poll(() => services.purchasesReportScreen.fetchPurchasesReport)
    .toHaveBeenCalledWith({ from: "2026-09-01", to: "2026-10-31" });
  expect(window.location.search).toBe("?from=2026-09-01&to=2026-10-31");
});

test("sends a user without the reports permission to Mi cuenta", async () => {
  const services = reportsServices(["stock_area"]);
  window.history.pushState(null, "", "/reports/purchases-by-supplier");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(services.purchasesReportScreen.fetchPurchasesReport).not.toHaveBeenCalled();
});
