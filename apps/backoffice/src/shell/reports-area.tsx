import { createRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  BadgePercent,
  Calculator,
  CalendarClock,
  ChartColumn,
  FileText,
  HandCoins,
  List,
  Package,
  PackageX,
  Receipt,
  ShoppingCart,
  Scale,
  Undo2,
  Users,
  Wallet,
  Warehouse,
} from "lucide-react";
import { AreaLayout, SectionLink } from "./area-layout";
import { canSeeReports, canSeeReturnsReport } from "./backoffice-access";
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
  const handConfirmedPaymentsShown = Boolean(
    matchRoute({ to: "/reports/hand-confirmed-payments" }),
  );
  const cashMovementsShown = Boolean(matchRoute({ to: "/reports/cash-movements" }));
  const cashSessionClosesShown = Boolean(matchRoute({ to: "/reports/cash-session-closes" }));
  const salesByProductAndCategoryShown = Boolean(
    matchRoute({ to: "/reports/sales-by-product-and-category" }),
  );
  const salesByCashierShown = Boolean(matchRoute({ to: "/reports/sales-by-cashier" }));
  const handTypedWeightsShown = Boolean(matchRoute({ to: "/reports/hand-typed-weights" }));
  const salesByPromotionShown = Boolean(matchRoute({ to: "/reports/sales-by-promotion" }));
  const manualDiscountsShown = Boolean(matchRoute({ to: "/reports/manual-discounts" }));
  const currentStockShown = Boolean(matchRoute({ to: "/reports/current-stock" }));
  const expiringLotsShown = Boolean(matchRoute({ to: "/reports/expiring-lots" }));
  const lossesByReasonShown = Boolean(matchRoute({ to: "/reports/losses-by-reason" }));
  const purchasesReportShown = Boolean(matchRoute({ to: "/reports/purchases-by-supplier" }));
  const averageTicketShown = Boolean(matchRoute({ to: "/reports/average-ticket" }));
  const issuedFiscalDocumentsShown = Boolean(matchRoute({ to: "/reports/fiscal-documents" }));
  const returnsShown = Boolean(matchRoute({ to: "/reports/returns" }));
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
                    to="/reports/hand-confirmed-payments"
                    label="Pagos confirmados a mano"
                    icon={<Wallet />}
                    search={handConfirmedPaymentsShown ? true : {}}
                    active={handConfirmedPaymentsShown}
                  />
                </li>
                <li>
                  <SectionLink
                    to="/reports/cash-session-closes"
                    label="Cierres de sesión"
                    icon={<Calculator />}
                    search={cashSessionClosesShown ? true : {}}
                    active={cashSessionClosesShown}
                  />
                </li>
                <li>
                  <SectionLink
                    to="/reports/cash-movements"
                    label="Movimientos de caja"
                    icon={<ArrowLeftRight />}
                    search={cashMovementsShown ? true : {}}
                    active={cashMovementsShown}
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
                    to="/reports/current-stock"
                    label="Stock actual valorizado"
                    icon={<Warehouse />}
                    search={currentStockShown ? true : {}}
                    active={currentStockShown}
                  />
                </li>
                <li>
                  <SectionLink
                    to="/reports/expiring-lots"
                    label="Lotes por vencer"
                    icon={<CalendarClock />}
                    search={expiringLotsShown ? true : {}}
                    active={expiringLotsShown}
                  />
                </li>
                <li>
                  <SectionLink
                    to="/reports/losses-by-reason"
                    label="Mermas por motivo"
                    icon={<PackageX />}
                    search={lossesByReasonShown ? true : {}}
                    active={lossesByReasonShown}
                  />
                </li>
                <li>
                  <SectionLink
                    to="/reports/purchases-by-supplier"
                    label="Compras por proveedor"
                    icon={<ShoppingCart />}
                    search={purchasesReportShown ? true : {}}
                    active={purchasesReportShown}
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
                    to="/reports/fiscal-documents"
                    label="Comprobantes emitidos"
                    icon={<FileText />}
                    search={issuedFiscalDocumentsShown ? true : {}}
                    active={issuedFiscalDocumentsShown}
                  />
                </li>
              </>
            )}
            {canSeeReturnsReport(session) && (
              <li>
                <SectionLink
                  to="/reports/returns"
                  label="Devoluciones"
                  icon={<Undo2 />}
                  search={returnsShown ? true : {}}
                  active={returnsShown}
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
