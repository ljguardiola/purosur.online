import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { openSession } from "../sessions/test-support/open-session";
import { expiringLotsReport } from "../stock/test-support/expiring-lots-report-fixtures";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens(["/", "/account", "/help", "/reports", "/reports/expiring-lots"]);

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
  vi.mocked(services.expiringLotsReportScreen.fetchExpiringLotsReport).mockResolvedValue({
    kind: "ok",
    value: expiringLotsReport(),
  });
  return services;
}

test("opens the report from the list and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("main").getByRole("link", { name: "Lotes por vencer" }));

  await expect
    .element(screen.getByRole("heading", { name: "Lotes por vencer", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/reports/expiring-lots");
  await expect.element(screen.getByRole("table").getByText("Queso cremoso")).toBeVisible();
  expect(services.expiringLotsReportScreen.fetchExpiringLotsReport).toHaveBeenCalledWith({});
  expect(document.title).toBe("Lotes por vencer · Puro Sur");
});

test("offers the report in the reports side column", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/expiring-lots");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("link", { name: "Lotes por vencer", includeHidden: false }).first())
    .toBeVisible();
});

test("keeps the period in the URL and asks the cloud for it", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/expiring-lots?from=2026-12-01&to=2026-12-31");

  await render(<App help={emptyHelp} services={services} />);

  await expect
    .poll(() => services.expiringLotsReportScreen.fetchExpiringLotsReport)
    .toHaveBeenCalledWith({ from: "2026-12-01", to: "2026-12-31" });
  expect(window.location.search).toBe("?from=2026-12-01&to=2026-12-31");
});

test("writes a URL with a period the cloud would refuse without it", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/expiring-lots?from=2026-12-31&to=2026-12-01");

  await render(<App help={emptyHelp} services={services} />);

  await expect.poll(() => window.location.search).toBe("");
  expect(services.expiringLotsReportScreen.fetchExpiringLotsReport).toHaveBeenCalledWith({});
  expect(services.expiringLotsReportScreen.fetchExpiringLotsReport).toHaveBeenCalledTimes(1);
});

test("sends a user without the reports permission to Mi cuenta", async () => {
  const services = reportsServices(["stock_area"]);
  window.history.pushState(null, "", "/reports/expiring-lots");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(services.expiringLotsReportScreen.fetchExpiringLotsReport).not.toHaveBeenCalled();
});
