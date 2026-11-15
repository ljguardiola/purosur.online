import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { AI_COST_BY_SUPPLIER } from "../purchasing/test-support/ai-cost";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { expectOneNavigationLevel } from "./test-support/area-structure";
import { reportsServices as reportsServicesOf } from "./test-support/reports-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens(["/", "/help", "/branch", "/reports/sales-by-day", "/ai-cost"]);

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
  window.history.pushState(null, "", "/ai-cost");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expectOneNavigationLevel(screen, "Configuración", ["Sucursal", "Costo de IA"]);
  await expect
    .element(screen.getByRole("tab", { name: "Costo de IA", selected: true }))
    .toBeVisible();
  expect(screen.getByText("Reportes · Compras").query()).toBeNull();
  await expect.element(screen.getByText("Distribuidora Andina").first()).toBeVisible();
  expect(services.aiCostReportScreen.fetchAiCostReport).toHaveBeenCalledWith({
    group_by: "supplier",
  });
  expect(document.title).toBe("Costo de IA · Puro Sur");
});

test("offers the report as the last Configuración tab, to who may see it", async () => {
  const services = reportsServices(["reports_area", "branch_area"]);
  window.history.pushState(null, "", "/ai-cost");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("tab", { name: "Costo de IA", selected: true }))
    .toBeVisible();
  await expect
    .element(
      screen
        .getByRole("navigation", { name: "Áreas" })
        .getByRole("link", { name: "Configuración" }),
    )
    .toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("heading", { name: "Diagnóstico" }).query()).toBeNull();
});

test("places Cambios de cajas retenidos before Costo de IA in the tab row", async () => {
  const services = reportsServices(["reports_area", "branch_area", "quarantined_events"]);
  window.history.pushState(null, "", "/ai-cost");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expectOneNavigationLevel(screen, "Configuración", [
    "Sucursal",
    "Cambios de cajas retenidos",
    "Costo de IA",
  ]);
});

test("leaves the report out of the Configuración tabs without the reports area", async () => {
  const services = reportsServices(["branch_area"]);
  window.history.pushState(null, "", "/branch");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Sucursal" })).toBeVisible();
  expect(screen.getByRole("tab", { name: "Costo de IA" }).query()).toBeNull();
  expect(screen.getByRole("heading", { name: "Diagnóstico" }).query()).toBeNull();
});

test("leaves the report out of Reportes", async () => {
  const services = reportsServices(["reports_area", "branch_area"]);
  window.history.pushState(null, "", "/reports/sales-by-day");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("tablist", { name: "Secciones de Reportes" }))
    .toBeVisible();
  expect(screen.getByRole("tab", { name: "Costo de IA" }).query()).toBeNull();
  expect(screen.getByRole("radio", { name: "Costo de IA" }).query()).toBeNull();
});

test("keeps the period and the grouping in the URL and asks the cloud for them", async () => {
  const services = reportsServices(["reports_area", "branch_area"]);
  window.history.pushState(null, "", "/ai-cost?from=2026-10-01&group=day&to=2026-10-31");

  await render(<App help={emptyHelp} services={services} />);

  await expect
    .poll(() => services.aiCostReportScreen.fetchAiCostReport)
    .toHaveBeenCalledWith({ from: "2026-10-01", to: "2026-10-31", group_by: "day" });
  expect(window.location.search).toBe("?from=2026-10-01&group=day&to=2026-10-31");
});

test("redirects the old /reports/ai-cost-by-period address to /ai-cost keeping the period and the grouping", async () => {
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
  expect(window.location.pathname).toBe("/ai-cost");
  expect(window.location.search).toBe("?from=2026-10-01&group=day&to=2026-10-31");
});

test("sends a user without the branch area to the own account panel", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/ai-cost");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
  expect(services.aiCostReportScreen.fetchAiCostReport).not.toHaveBeenCalled();
});

test("sends a user without the reports area to the own account panel", async () => {
  const services = reportsServices(["branch_area"]);
  window.history.pushState(null, "", "/ai-cost");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
  expect(services.aiCostReportScreen.fetchAiCostReport).not.toHaveBeenCalled();
});
