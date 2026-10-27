import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { openSession } from "../sessions/test-support/open-session";
import { lossesByReasonReport } from "../stock/test-support/losses-by-reason-report-fixtures";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens(["/", "/account", "/help", "/reports", "/reports/losses-by-reason"]);

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
  vi.mocked(services.lossesByReasonReportScreen.fetchLossesByReasonReport).mockResolvedValue({
    kind: "ok",
    value: lossesByReasonReport(),
  });
  return services;
}

test("opens the report from the list and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("main").getByRole("link", { name: "Mermas por motivo" }));

  await expect
    .element(screen.getByRole("heading", { name: "Mermas por motivo", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/reports/losses-by-reason");
  await expect
    .element(
      screen
        .getByRole("table", { name: "Productos perdidos por Mal estado" })
        .getByText("Queso cremoso"),
    )
    .toBeVisible();
  expect(services.lossesByReasonReportScreen.fetchLossesByReasonReport).toHaveBeenCalledWith({});
  expect(document.title).toBe("Mermas por motivo · Puro Sur");
});

test("offers the report in the reports side column", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/losses-by-reason");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("link", { name: "Mermas por motivo", includeHidden: false }).first())
    .toBeVisible();
});

test("keeps the period in the URL and asks the cloud for it", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/losses-by-reason?from=2026-12-01&to=2026-12-31");

  await render(<App help={emptyHelp} services={services} />);

  await expect
    .poll(() => services.lossesByReasonReportScreen.fetchLossesByReasonReport)
    .toHaveBeenCalledWith({ from: "2026-12-01", to: "2026-12-31" });
  expect(window.location.search).toBe("?from=2026-12-01&to=2026-12-31");
});

test("writes a URL with a period the cloud would refuse without it", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/losses-by-reason?from=2026-12-31&to=2026-12-01");

  await render(<App help={emptyHelp} services={services} />);

  await expect.poll(() => window.location.search).toBe("");
  expect(services.lossesByReasonReportScreen.fetchLossesByReasonReport).toHaveBeenCalledWith({});
  expect(services.lossesByReasonReportScreen.fetchLossesByReasonReport).toHaveBeenCalledTimes(1);
});

test("sends a user without the reports permission to Mi cuenta", async () => {
  const services = reportsServices(["stock_area"]);
  window.history.pushState(null, "", "/reports/losses-by-reason");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(services.lossesByReasonReportScreen.fetchLossesByReasonReport).not.toHaveBeenCalled();
});
