import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { weekChargeCosts } from "../payments/test-support/mercado-pago-charge-costs-fixtures";
import { openSession } from "../sessions/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens(["/", "/help", "/reports", "/reports/mercado-pago-charge-costs"]);

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
  vi.mocked(services.ownCredentialsSection.fetchPasskeys).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  vi.mocked(services.mercadoPagoChargeCostsScreen.fetchMercadoPagoChargeCosts).mockResolvedValue({
    kind: "ok",
    value: weekChargeCosts,
  });
  return services;
}

test("opens the report from the list and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area", "mercado_pago_charge_costs"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(
    screen.getByRole("main").getByRole("link", { name: "Costos de Mercado Pago" }),
  );

  await expect
    .element(screen.getByRole("heading", { name: "Costos de Mercado Pago", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/reports/mercado-pago-charge-costs");
  await expect.element(screen.getByText("Comisión de Mercado Pago").first()).toBeVisible();
  expect(services.mercadoPagoChargeCostsScreen.fetchMercadoPagoChargeCosts).toHaveBeenCalledWith(
    {},
  );
  expect(document.title).toBe("Costos de Mercado Pago · Puro Sur");
});

test("offers the report in the reports side column to who holds its permission", async () => {
  const services = reportsServices(["reports_area", "mercado_pago_charge_costs"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(
      screen
        .getByRole("navigation", { name: "Reportes" })
        .getByRole("link", { name: "Costos de Mercado Pago" }),
    )
    .toBeVisible();
});

test("leaves the report out of the side column and the list without its permission", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("navigation", { name: "Reportes" }).getByRole("link").first())
    .toBeVisible();
  expect(screen.getByRole("link", { name: "Costos de Mercado Pago" }).query()).toBeNull();
});

test("keeps the period and the grouping in the URL and asks the cloud for the period", async () => {
  const services = reportsServices(["mercado_pago_charge_costs"]);
  window.history.pushState(
    null,
    "",
    "/reports/mercado-pago-charge-costs?from=2026-10-01&group=method&to=2026-10-31",
  );

  await render(<App help={emptyHelp} services={services} />);

  await expect
    .poll(() => services.mercadoPagoChargeCostsScreen.fetchMercadoPagoChargeCosts)
    .toHaveBeenCalledWith({ from: "2026-10-01", to: "2026-10-31" });
  expect(window.location.search).toBe("?from=2026-10-01&group=method&to=2026-10-31");
});

test("sends a user with only the reports area to Mi cuenta", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/mercado-pago-charge-costs");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
  expect(services.mercadoPagoChargeCostsScreen.fetchMercadoPagoChargeCosts).not.toHaveBeenCalled();
});

test("offers Reportes to who holds only the charge costs permission, leading to the report", async () => {
  const services = reportsServices(["mercado_pago_charge_costs"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);
  const areas = screen.getByRole("navigation", { name: "Áreas" });
  await expect
    .element(areas.getByRole("link", { name: "Reportes", exact: true }))
    .toHaveAttribute("href", "/reports/mercado-pago-charge-costs");
  await userEvent.click(areas.getByRole("link", { name: "Reportes", exact: true }));

  await expect
    .element(screen.getByRole("heading", { name: "Costos de Mercado Pago", level: 1 }))
    .toBeVisible();
  const sections = screen.getByRole("navigation", { name: "Reportes" });
  await expect
    .element(sections.getByRole("link", { name: "Costos de Mercado Pago" }))
    .toBeVisible();
  expect(sections.getByRole("link", { name: "Todos los reportes" }).query()).toBeNull();
  expect(sections.getByRole("link", { name: "Ventas por día o por rango" }).query()).toBeNull();
});

test("leads Reportes to the list of reports for who also holds the reports area", async () => {
  const services = reportsServices(["reports_area", "mercado_pago_charge_costs"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(
      screen
        .getByRole("navigation", { name: "Áreas" })
        .getByRole("link", { name: "Reportes", exact: true }),
    )
    .toHaveAttribute("href", "/reports");
});

test("hides Reportes from who holds neither the reports area nor the charge costs permission", async () => {
  const services = reportsServices(["branch_area"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Reportes", exact: true }).query()).toBeNull();
});
