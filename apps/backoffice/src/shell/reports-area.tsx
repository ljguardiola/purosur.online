import { createRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import {
  BadgePercent,
  ChartColumn,
  HandCoins,
  List,
  Package,
  Receipt,
  Users,
  Wallet,
} from "lucide-react";
import { AreaLayout, SectionLink } from "./area-layout";
import { signedInRoute } from "./signed-in-route";

export const reportsAreaRoute = createRoute({
  getParentRoute: () => signedInRoute,
  id: "reports-area",
  component: ReportsArea,
});

function ReportsArea() {
  const matchRoute = useMatchRoute();
  const salesByDayShown = Boolean(matchRoute({ to: "/reports/sales-by-day" }));
  const salesByPaymentMethodShown = Boolean(matchRoute({ to: "/reports/sales-by-payment-method" }));
  const handConfirmedPaymentsShown = Boolean(
    matchRoute({ to: "/reports/hand-confirmed-payments" }),
  );
  const salesByProductAndCategoryShown = Boolean(
    matchRoute({ to: "/reports/sales-by-product-and-category" }),
  );
  const salesByCashierShown = Boolean(matchRoute({ to: "/reports/sales-by-cashier" }));
  const salesByPromotionShown = Boolean(matchRoute({ to: "/reports/sales-by-promotion" }));
  const manualDiscountsShown = Boolean(matchRoute({ to: "/reports/manual-discounts" }));
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
                to="/reports/hand-confirmed-payments"
                label="Pagos confirmados a mano"
                icon={<Wallet />}
                search={handConfirmedPaymentsShown ? true : {}}
                active={handConfirmedPaymentsShown}
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
                to="/reports/average-ticket"
                label="Ticket promedio"
                icon={<Receipt />}
                search={averageTicketShown ? true : {}}
                active={averageTicketShown}
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
          </ul>
        </>
      }
    >
      <Outlet />
    </AreaLayout>
  );
}
