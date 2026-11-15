import { beforeEach, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { choosePeriodShortcut, periodShortcuts } from "./test-support/period-shortcuts";
import { reportsServices } from "./test-support/reports-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

const REPORT_PATHS = [
  "/reports/sales-by-day",
  "/reports/sales-by-payment-method",
  "/reports/sales-by-product-and-category",
  "/reports/sales-by-cashier",
  "/reports/average-ticket",
  "/reports/sales-by-promotion",
  "/reports/manual-discounts",
  "/reports/cash-rounding",
  "/reports/hand-typed-weights",
  "/reports/margin",
  "/reports/mercado-pago-charge-costs",
] as const;

opensOnlyScreens([...REPORT_PATHS]);

beforeEach(resetPageState);

const SHORTCUTS = ["Hoy", "Últimos 7 días", "Este mes", "Mes anterior"];

test.each(REPORT_PATHS)("offers the period shortcuts on %s", async (path) => {
  const services = reportsServices(["reports_area", "mercado_pago_charge_costs"]);
  window.history.pushState(null, "", path);

  const screen = await render(<App help={emptyHelp} services={services} />);

  const shortcuts = periodShortcuts(screen);
  await expect.element(shortcuts).not.toHaveAttribute("aria-disabled", "true");
  for (const name of SHORTCUTS) {
    await expect.element(shortcuts.getByRole("radio", { name })).toBeInTheDocument();
  }
});

test("keeps the period of the shortcut chosen in the address", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/sales-by-day");
  const screen = await render(<App help={emptyHelp} services={services} />);
  const shortcuts = periodShortcuts(screen);
  await expect.element(shortcuts).not.toHaveAttribute("aria-disabled", "true");

  await choosePeriodShortcut(screen, "Mes anterior");

  await expect
    .poll(() => Object.fromEntries(new URLSearchParams(window.location.search)))
    .toEqual({ from: "2026-09-01", to: "2026-09-30" });
});
