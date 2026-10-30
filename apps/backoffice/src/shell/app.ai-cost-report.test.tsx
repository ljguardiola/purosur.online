import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { AI_COST_BY_SUPPLIER } from "../purchasing/test-support/ai-cost";
import { openSession } from "../sessions/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens(["/", "/account", "/help", "/reports", "/reports/ai-cost-by-period"]);

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
  vi.mocked(services.aiCostReportScreen.fetchAiCostReport).mockResolvedValue({
    kind: "ok",
    value: AI_COST_BY_SUPPLIER,
  });
  return services;
}

test("opens the report from the list and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area", "branch_area"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(
    screen.getByRole("main").getByRole("link", { name: "Costo de IA por período" }),
  );

  await expect
    .element(screen.getByRole("heading", { name: "Costo de IA por período", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/reports/ai-cost-by-period");
  await expect.element(screen.getByText("Distribuidora Andina").first()).toBeVisible();
  expect(services.aiCostReportScreen.fetchAiCostReport).toHaveBeenCalledWith({
    group_by: "supplier",
  });
  expect(document.title).toBe("Costo de IA por período · Puro Sur");
});

test("offers the report in the reports side column to who may change the branch's settings", async () => {
  const services = reportsServices(["reports_area", "branch_area"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(
      screen
        .getByRole("navigation", { name: "Reportes" })
        .getByRole("link", { name: "Costo de IA por período" }),
    )
    .toBeVisible();
});

test("leaves the report out of the side column and the list without the branch area", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("navigation", { name: "Reportes" }).getByRole("link").first())
    .toBeVisible();
  expect(screen.getByRole("link", { name: "Costo de IA por período" }).query()).toBeNull();
});

test("keeps the period and the grouping in the URL and asks the cloud for them", async () => {
  const services = reportsServices(["reports_area", "branch_area"]);
  window.history.pushState(
    null,
    "",
    "/reports/ai-cost-by-period?from=2026-10-01&to=2026-10-31&group=day",
  );

  await render(<App help={emptyHelp} services={services} />);

  await expect
    .poll(() => services.aiCostReportScreen.fetchAiCostReport)
    .toHaveBeenCalledWith({ from: "2026-10-01", to: "2026-10-31", group_by: "day" });
  expect(window.location.search).toBe("?from=2026-10-01&to=2026-10-31&group=day");
});

test("sends a user without the branch area to Mi cuenta", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/ai-cost-by-period");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(services.aiCostReportScreen.fetchAiCostReport).not.toHaveBeenCalled();
});

test("sends a user without the reports area to Mi cuenta", async () => {
  const services = reportsServices(["branch_area"]);
  window.history.pushState(null, "", "/reports/ai-cost-by-period");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(services.aiCostReportScreen.fetchAiCostReport).not.toHaveBeenCalled();
});
