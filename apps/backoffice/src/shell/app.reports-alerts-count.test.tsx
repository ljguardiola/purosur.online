import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { FetchAlertsOverviewOutcome } from "../alerts/alerts-api";
import { openSession } from "../sessions/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

const REPORT_SCREENS = [
  ["/reports", "Reportes"],
  ["/reports/sales-by-day", "Ventas por día o por rango"],
  ["/reports/sales-by-payment-method", "Ventas por medio de pago"],
  ["/reports/hand-confirmed-payments", "Pagos confirmados a mano"],
  ["/reports/cash-session-closes", "Cierres de sesión"],
  ["/reports/cash-movements", "Movimientos de caja"],
  ["/reports/sales-by-product-and-category", "Ventas por producto y por categoría"],
  ["/reports/sales-by-cashier", "Ventas por cajero"],
  ["/reports/hand-typed-weights", "Pesos tipeados a mano"],
  ["/reports/average-ticket", "Ticket promedio"],
  ["/reports/current-stock", "Stock actual valorizado"],
  ["/reports/expiring-lots", "Lotes por vencer"],
  ["/reports/losses-by-reason", "Mermas por motivo"],
  ["/reports/margin", "Margen por producto y por categoría"],
  ["/reports/prices-past-review-deadline", "Precios sin revisar"],
  ["/reports/purchases-by-supplier", "Compras por proveedor"],
  ["/reports/freight-by-period", "Flete por período"],
  ["/reports/pending-purchase-orders", "Pedidos pendientes de recibir"],
  ["/reports/receipt-differences", "Diferencias de recepción"],
  ["/reports/sales-by-promotion", "Descuentos por promoción"],
  ["/reports/manual-discounts", "Descuentos manuales y sobre el total"],
  ["/reports/cash-rounding", "Redondeo en efectivo"],
  ["/reports/fiscal-documents", "Comprobantes emitidos"],
  ["/reports/ai-cost-by-period", "Costo de IA por período"],
  ["/reports/returns", "Anulaciones y devoluciones"],
] as const;

opensOnlyScreens(["/", "/account", "/alerts", "/help", ...REPORT_SCREENS.map(([path]) => path)]);

beforeEach(resetPageState);

const threeOpenAlerts: FetchAlertsOverviewOutcome = {
  kind: "ok",
  value: {
    critical: { openCount: 1, kinds: ["user_access_increased"] },
    warning: { openCount: 2, kinds: ["user_email_changed"] },
    informational: { openCount: 0, kinds: [] },
  },
};

test.each(REPORT_SCREENS)(
  "counts the open alerts in %s's top bar and opens the alerts list from it",
  async (path, heading) => {
    const services = createAppServices({
      fetchSession: vi.fn().mockResolvedValue(openSession()),
    });
    vi.mocked(services.alertsOpenCountLink.fetchAlertsOverview).mockResolvedValue(threeOpenAlerts);
    window.history.pushState(null, "", path);

    const screen = await render(<App help={emptyHelp} services={services} />);

    await expect.element(screen.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    await userEvent.click(screen.getByRole("link", { name: "3 alertas abiertas" }));

    await expect.element(screen.getByRole("heading", { name: "Alertas", level: 1 })).toBeVisible();
    expect(window.location.pathname).toBe("/alerts");
  },
);

test("never asks for the alerts count of a user who may not see alerts", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({ isAdministrator: false, capabilities: ["reports_area"] }),
    ),
  });
  vi.mocked(services.alertsOpenCountLink.fetchAlertsOverview).mockResolvedValue(threeOpenAlerts);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Reportes", level: 1 })).toBeVisible();
  expect(services.alertsOpenCountLink.fetchAlertsOverview).not.toHaveBeenCalled();
  expect(screen.getByText(/alertas? abiertas?/).query()).toBeNull();
});
