import { beforeEach, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { reportsServices } from "./test-support/reports-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens(["/", "/help", "/reports/margin", "/reports/mercado-pago-charge-costs"]);

beforeEach(resetPageState);

test("opens the report at its address and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area", "mercado_pago_charge_costs"]);
  window.history.pushState(null, "", "/reports/mercado-pago-charge-costs");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Costos de Mercado Pago", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByText("Comisión de Mercado Pago").first()).toBeVisible();
  expect(services.mercadoPagoChargeCostsScreen.fetchMercadoPagoChargeCosts).toHaveBeenCalledWith(
    {},
  );
  expect(document.title).toBe("Costos de Mercado Pago · Puro Sur");
});

test("leaves the report out of Rentabilidad without its permission", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/margin");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Margen por producto y por categoría", level: 1 }))
    .toBeVisible();
  expect(screen.getByRole("radio", { name: "Costos de Mercado Pago" }).query()).toBeNull();
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

test("leads Reportes to the reports page for who also holds the reports area", async () => {
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
