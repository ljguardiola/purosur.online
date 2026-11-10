import { createRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import {
  BadgePercent,
  Bot,
  ChartColumn,
  Coins,
  HandCoins,
  Landmark,
  List,
  Package,
  Receipt,
  Scale,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { AreaLayout, SectionLink } from "./area-layout";
import {
  canSeeAiCostReport,
  canSeeMercadoPagoChargeCosts,
  canSeeReports,
} from "./backoffice-access";
import { signedInRoute } from "./signed-in-route";

export const reportsAreaRoute = createRoute({
  getParentRoute: () => signedInRoute,
  id: "reports-area",
  component: ReportsArea,
});

function ReportsArea() {
  const { session } = signedInRoute.useRouteContext();
  const matchRoute = useMatchRoute();
  const salesByDayShown = Boolean(matchRoute({ to: "/reports/sales-by-day" }));
  const salesByPaymentMethodShown = Boolean(matchRoute({ to: "/reports/sales-by-payment-method" }));
  const salesByProductAndCategoryShown = Boolean(
    matchRoute({ to: "/reports/sales-by-product-and-category" }),
  );
  const salesByCashierShown = Boolean(matchRoute({ to: "/reports/sales-by-cashier" }));
  const handTypedWeightsShown = Boolean(matchRoute({ to: "/reports/hand-typed-weights" }));
  const salesByPromotionShown = Boolean(matchRoute({ to: "/reports/sales-by-promotion" }));
  const manualDiscountsShown = Boolean(matchRoute({ to: "/reports/manual-discounts" }));
  const cashRoundingShown = Boolean(matchRoute({ to: "/reports/cash-rounding" }));
  const marginReportShown = Boolean(matchRoute({ to: "/reports/margin" }));
  const aiCostReportShown = Boolean(matchRoute({ to: "/reports/ai-cost-by-period" }));
  const mercadoPagoChargeCostsShown = Boolean(
    matchRoute({ to: "/reports/mercado-pago-charge-costs" }),
  );
  const averageTicketShown = Boolean(matchRoute({ to: "/reports/average-ticket" }));
  return (
    <AreaLayout
      area="reports"
      sectionColumnLabel="Reportes"
      sectionColumn={
        <>
          <h2 className="text-text-accent text-heading">Reportes</h2>
          <div className="h-2.5" />
          <ul className="flex flex-col gap-1">
            {canSeeReports(session) && (
              <>
                <li>
                  <SectionLink
                    to="/reports"
                    label="Todos los reportes"
                    icon={<List />}
                    active={Boolean(matchRoute({ to: "/reports" }))}
                  />
                </li>
                <li>
                  <SectionLink
                    to="/reports/sales-by-day"
                    label="Ventas por día o por rango"
                    icon={<ChartColumn />}
                    search={salesByDayShown ? true : {}}
                    active={salesByDayShown}
                  />
                </li>
                <li>
                  <SectionLink
                    to="/reports/sales-by-payment-method"
                    label="Ventas por medio de pago"
                    icon={<Wallet />}
                    search={salesByPaymentMethodShown ? true : {}}
                    active={salesByPaymentMethodShown}
                  />
                </li>
                <li>
                  <SectionLink
                    to="/reports/sales-by-product-and-category"
                    label="Ventas por producto y por categoría"
                    icon={<Package />}
                    search={salesByProductAndCategoryShown ? true : {}}
                    active={salesByProductAndCategoryShown}
                  />
                </li>
                <li>
                  <SectionLink
                    to="/reports/sales-by-cashier"
                    label="Ventas por cajero"
                    icon={<Users />}
                    search={salesByCashierShown ? true : {}}
                    active={salesByCashierShown}
                  />
                </li>
                <li>
                  <SectionLink
                    to="/reports/hand-typed-weights"
                    label="Pesos tipeados a mano"
                    icon={<Scale />}
                    search={handTypedWeightsShown ? true : {}}
                    active={handTypedWeightsShown}
                  />
                </li>
                <li>
                  <SectionLink
                    to="/reports/average-ticket"
                    label="Ticket promedio"
                    icon={<Receipt />}
                    search={averageTicketShown ? true : {}}
                    active={averageTicketShown}
                  />
                </li>
                <li>
                  <SectionLink
                    to="/reports/margin"
                    label="Margen por producto y por categoría"
                    icon={<TrendingUp />}
                    search={marginReportShown ? true : {}}
                    active={marginReportShown}
                  />
                </li>
                <li>
                  <SectionLink
                    to="/reports/sales-by-promotion"
                    label="Descuentos por promoción"
                    icon={<BadgePercent />}
                    search={salesByPromotionShown ? true : {}}
                    active={salesByPromotionShown}
                  />
                </li>
                <li>
                  <SectionLink
                    to="/reports/manual-discounts"
                    label="Descuentos manuales y sobre el total"
                    icon={<HandCoins />}
                    search={manualDiscountsShown ? true : {}}
                    active={manualDiscountsShown}
                  />
                </li>
                <li>
                  <SectionLink
                    to="/reports/cash-rounding"
                    label="Redondeo en efectivo"
                    icon={<Coins />}
                    search={cashRoundingShown ? true : {}}
                    active={cashRoundingShown}
                  />
                </li>
              </>
            )}
            {canSeeMercadoPagoChargeCosts(session) && (
              <li>
                <SectionLink
                  to="/reports/mercado-pago-charge-costs"
                  label="Costos de Mercado Pago"
                  icon={<Landmark />}
                  search={mercadoPagoChargeCostsShown ? true : {}}
                  active={mercadoPagoChargeCostsShown}
                />
              </li>
            )}
            {canSeeAiCostReport(session) && (
              <li>
                <SectionLink
                  to="/reports/ai-cost-by-period"
                  label="Costo de IA por período"
                  icon={<Bot />}
                  search={aiCostReportShown ? true : {}}
                  active={aiCostReportShown}
                />
              </li>
            )}
          </ul>
        </>
      }
    >
      <Outlet />
    </AreaLayout>
  );
}
