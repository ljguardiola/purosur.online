import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { AI_COST_BY_SUPPLIER } from "../purchasing/test-support/ai-cost";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { reportsServices as reportsServicesOf } from "./test-support/reports-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens([
  "/",
  "/help",
  "/location-settings",
  "/reports/sales-by-day",
  "/reports/ai-cost-by-period",
]);

beforeEach(resetPageState);

function reportsServices(capabilities: Capability[]) {
  const services = reportsServicesOf(capabilities);
  vi.mocked(services.aiCostReportScreen.fetchAiCostReport).mockResolvedValue({
    kind: "ok",
    value: AI_COST_BY_SUPPLIER,
  });
  return services;
}

test("opens the report at its address, under Configuración, and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area", "branch_area"]);
  window.history.pushState(null, "", "/reports/ai-cost-by-period");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Costo de IA por período", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByText("Configuración", { exact: true }).first()).toBeVisible();
  expect(screen.getByText("Reportes · Compras").query()).toBeNull();
  await expect.element(screen.getByText("Distribuidora Andina").first()).toBeVisible();
  expect(services.aiCostReportScreen.fetchAiCostReport).toHaveBeenCalledWith({
    group_by: "supplier",
  });
  expect(document.title).toBe("Costo de IA por período · Puro Sur");
});

test("offers the report in the Configuración column, after the other items, to who may see it", async () => {
  const services = reportsServices(["reports_area", "branch_area"]);
  window.history.pushState(null, "", "/reports/ai-cost-by-period");

  const screen = await render(<App help={emptyHelp} services={services} />);

  const sections = screen.getByRole("navigation", { name: "Configuración" });
  await expect
    .element(sections.getByRole("link", { name: "Costo de IA por período" }))
    .toHaveAttribute("aria-current", "page");
  await expect
    .element(
      screen.getByRole("navigation", { name: "Áreas" }).getByRole("link", { name: "Config" }),
    )
    .toHaveAttribute("aria-current", "page");
  const labels = sections
    .getByRole("link")
    .elements()
    .map((link) => link.textContent);
  expect(labels.at(-1)).toBe("Costo de IA por período");
});

test("leaves the report out of the Configuración column without the reports area", async () => {
  const services = reportsServices(["branch_area"]);
  window.history.pushState(null, "", "/location-settings");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(
      screen.getByRole("navigation", { name: "Configuración" }).getByRole("link", {
        name: "Sucursal",
      }),
    )
    .toBeVisible();
  expect(screen.getByRole("link", { name: "Costo de IA por período" }).query()).toBeNull();
});

test("leaves the report out of Reportes", async () => {
  const services = reportsServices(["reports_area", "branch_area"]);
  window.history.pushState(null, "", "/reports/sales-by-day");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Reportes" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Costo de IA por período" }).query()).toBeNull();
  expect(screen.getByRole("radio", { name: "Costo de IA por período" }).query()).toBeNull();
});

test("keeps the period and the grouping in the URL and asks the cloud for them", async () => {
  const services = reportsServices(["reports_area", "branch_area"]);
  window.history.pushState(
    null,
    "",
    "/reports/ai-cost-by-period?from=2026-10-01&group=day&to=2026-10-31",
  );

  await render(<App help={emptyHelp} services={services} />);

  await expect
    .poll(() => services.aiCostReportScreen.fetchAiCostReport)
    .toHaveBeenCalledWith({ from: "2026-10-01", to: "2026-10-31", group_by: "day" });
  expect(window.location.search).toBe("?from=2026-10-01&group=day&to=2026-10-31");
});

test("sends a user without the branch area to Mi cuenta", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/ai-cost-by-period");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
  expect(services.aiCostReportScreen.fetchAiCostReport).not.toHaveBeenCalled();
});

test("sends a user without the reports area to Mi cuenta", async () => {
  const services = reportsServices(["branch_area"]);
  window.history.pushState(null, "", "/reports/ai-cost-by-period");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
  expect(services.aiCostReportScreen.fetchAiCostReport).not.toHaveBeenCalled();
});
