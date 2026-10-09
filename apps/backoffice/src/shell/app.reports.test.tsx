import type { Capability } from "@purosur/domain";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { registers, weekReport } from "../sales/test-support/sales-fixtures";
import { openSession } from "../sessions/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens(["/", "/account", "/help", "/reports", "/reports/sales-by-day"]);

beforeEach(resetPageState);

afterEach(resetPageState);

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
  vi.mocked(services.salesByDayScreen.fetchSalesReport).mockResolvedValue({
    kind: "ok",
    value: weekReport,
  });
  vi.mocked(services.salesByDayScreen.fetchReportRegisters).mockResolvedValue({
    kind: "ok",
    value: registers,
  });
  return services;
}

test("opens the list of reports from the rail's Reportes item", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("link", { name: "Reportes" }));

  await expect.element(screen.getByRole("heading", { name: "Reportes", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/reports");
  const sections = screen.getByRole("navigation", { name: "Reportes" });
  await expect.element(sections.getByRole("link", { name: "Todos los reportes" })).toBeVisible();
  await expect
    .element(sections.getByRole("link", { name: "Ventas por día o por rango" }))
    .toBeVisible();
});

test("opens the sales by day report from the list and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(
    screen.getByRole("main").getByRole("link", { name: "Ventas por día o por rango" }),
  );

  await expect
    .element(screen.getByRole("heading", { name: "Ventas por día o por rango", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/reports/sales-by-day");
  await expect.element(screen.getByText("02/10/2026")).toBeVisible();
  expect(services.salesByDayScreen.fetchSalesReport).toHaveBeenCalledWith({});
  expect(document.title).toBe("Ventas por día o por rango · Puro Sur");
});

test("keeps the filters of the report in the address", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/sales-by-day");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByText("02/10/2026")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  await expect
    .poll(() => window.location.search)
    .toBe("?register=11111111-1111-4111-8111-111111111111");
});

test("hides the Reportes item in the rail for a user without the reports permission", async () => {
  const services = reportsServices(["stock_area", "stock_balances"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Reportes" }).query()).toBeNull();
});

test("shows the Reportes item in the rail to an Administrator", async () => {
  const services = reportsServices([]);
  vi.mocked(services.fetchSession).mockResolvedValue(openSession());
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("link", { name: "Reportes" })).toBeVisible();
});

test.each(["/reports", "/reports/sales-by-day"])(
  "sends a user without the reports permission who opens %s to Mi cuenta",
  async (path) => {
    const services = reportsServices(["stock_area"]);
    window.history.pushState(null, "", path);

    const screen = await render(<App help={emptyHelp} services={services} />);

    await expect
      .element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 }))
      .toBeVisible();
    expect(services.salesByDayScreen.fetchSalesReport).not.toHaveBeenCalled();
  },
);
