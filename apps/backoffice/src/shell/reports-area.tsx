import { createRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import {
  BadgePercent,
  Bot,
  CalendarClock,
  ChartColumn,
  Coins,
  FileText,
  HandCoins,
  Landmark,
  List,
  Package,
  PackageMinus,
  PackageOpen,
  PackageX,
  Receipt,
  Scale,
  ShoppingCart,
  TagX,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  Warehouse,
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
  const handConfirmedPaymentsShown = Boolean(
    matchRoute({ to: "/reports/hand-confirmed-payments" }),
  );
  const salesByProductAndCategoryShown = Boolean(
    matchRoute({ to: "/reports/sales-by-product-and-category" }),
  );
  const salesByCashierShown = Boolean(matchRoute({ to: "/reports/sales-by-cashier" }));
  const handTypedWeightsShown = Boolean(matchRoute({ to: "/reports/hand-typed-weights" }));
  const salesByPromotionShown = Boolean(matchRoute({ to: "/reports/sales-by-promotion" }));
  const manualDiscountsShown = Boolean(matchRoute({ to: "/reports/manual-discounts" }));
  const cashRoundingShown = Boolean(matchRoute({ to: "/reports/cash-rounding" }));
  const currentStockShown = Boolean(matchRoute({ to: "/reports/current-stock" }));
  const expiringLotsShown = Boolean(matchRoute({ to: "/reports/expiring-lots" }));
  const lossesByReasonShown = Boolean(matchRoute({ to: "/reports/losses-by-reason" }));
  const marginReportShown = Boolean(matchRoute({ to: "/reports/margin" }));
  const pricesPastReviewDeadlineShown = Boolean(
    matchRoute({ to: "/reports/prices-past-review-deadline" }),
  );
  const freightReportShown = Boolean(matchRoute({ to: "/reports/freight-by-period" }));
  const pendingPurchaseOrdersShown = Boolean(
    matchRoute({ to: "/reports/pending-purchase-orders" }),
  );
  const receiptDifferencesShown = Boolean(matchRoute({ to: "/reports/receipt-differences" }));
  const aiCostReportShown = Boolean(matchRoute({ to: "/reports/ai-cost-by-period" }));
  const mercadoPagoChargeCostsShown = Boolean(
    matchRoute({ to: "/reports/mercado-pago-charge-costs" }),
  );
  const purchasesReportShown = Boolean(matchRoute({ to: "/reports/purchases-by-supplier" }));
  const averageTicketShown = Boolean(matchRoute({ to: "/reports/average-ticket" }));
  const issuedFiscalDocumentsShown = Boolean(matchRoute({ to: "/reports/fiscal-documents" }));
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
                    to="/reports/margin"
                    label="Margen por producto y por categoría"
                    icon={<TrendingUp />}
                    search={marginReportShown ? true : {}}
                    active={marginReportShown}
                  />
                </li>
                <li>
                  <SectionLink
                    to="/reports/prices-past-review-deadline"
                    label="Precios sin revisar"
                    icon={<TagX />}
                    search={pricesPastReviewDeadlineShown ? true : {}}
                    active={pricesPastReviewDeadlineShown}
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
                    to="/reports/freight-by-period"
                    label="Flete por período"
                    icon={<Truck />}
                    search={freightReportShown ? true : {}}
                    active={freightReportShown}
                  />
                </li>
                <li>
                  <SectionLink
                    to="/reports/pending-purchase-orders"
                    label="Pedidos pendientes de recibir"
                    icon={<PackageOpen />}
                    search={pendingPurchaseOrdersShown ? true : {}}
                    active={pendingPurchaseOrdersShown}
                  />
                </li>
                <li>
                  <SectionLink
                    to="/reports/receipt-differences"
                    label="Diferencias de recepción"
                    icon={<PackageMinus />}
                    search={receiptDifferencesShown ? true : {}}
                    active={receiptDifferencesShown}
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
