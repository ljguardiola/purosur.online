import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { quarterFreightReport } from "../purchasing/test-support/freight-report-fixtures";
import { openSession } from "../sessions/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens(["/", "/account", "/help", "/reports", "/reports/freight-by-period"]);

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
  vi.mocked(services.freightReportScreen.fetchFreightReport).mockResolvedValue({
    kind: "ok",
    value: quarterFreightReport,
  });
  return services;
}

test("opens the report from the list and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("main").getByRole("link", { name: "Flete por período" }));

  await expect
    .element(screen.getByRole("heading", { name: "Flete por período", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/reports/freight-by-period");
  await expect.element(screen.getByText("septiembre de 2026")).toBeVisible();
  expect(services.freightReportScreen.fetchFreightReport).toHaveBeenCalledWith({});
  expect(document.title).toBe("Flete por período · Puro Sur");
});

test("offers the report in the reports side column", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(
      screen
        .getByRole("navigation", { name: "Reportes" })
        .getByRole("link", { name: "Flete por período" }),
    )
    .toBeVisible();
});

test("keeps the period in the URL and asks the cloud for it", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/freight-by-period?from=2026-09-01&to=2026-10-31");

  await render(<App help={emptyHelp} services={services} />);

  await expect
    .poll(() => services.freightReportScreen.fetchFreightReport)
    .toHaveBeenCalledWith({ from: "2026-09-01", to: "2026-10-31" });
  expect(window.location.search).toBe("?from=2026-09-01&to=2026-10-31");
});

test("sends a user without the reports permission to Mi cuenta", async () => {
  const services = reportsServices(["stock_area"]);
  window.history.pushState(null, "", "/reports/freight-by-period");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(services.freightReportScreen.fetchFreightReport).not.toHaveBeenCalled();
});
