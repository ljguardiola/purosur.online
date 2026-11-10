import { LinkListCard, LinkListRow } from "@purosur/ui";
import { createLink } from "@tanstack/react-router";
import { ShoppingBag, ShoppingCart, TrendingUp, Wallet } from "lucide-react";
import { AreaTopBar } from "../shell/area-top-bar";
import { ScreenLayout } from "../shell/screen-layout";

const ReportRow = createLink(LinkListRow);

export function ReportsIndexScreen({
  aiCostShown,
  mercadoPagoChargeCostsShown,
}: {
  aiCostShown: boolean;
  mercadoPagoChargeCostsShown: boolean;
}) {
  return (
    <ScreenLayout topBar={<AreaTopBar eyebrow="Puro Sur" title="Reportes" />} bodyClassName="p-6">
      <LinkListCard title="Ventas" icon={<ShoppingBag />}>
        <ReportRow to="/reports/sales-by-day" label="Ventas por día o por rango" />
        <ReportRow to="/reports/sales-by-payment-method" label="Ventas por medio de pago" />
        <ReportRow
          to="/reports/sales-by-product-and-category"
          label="Ventas por producto y por categoría"
        />
        <ReportRow to="/reports/sales-by-cashier" label="Ventas por cajero" />
        <ReportRow to="/reports/hand-typed-weights" label="Pesos tipeados a mano" />
        <ReportRow to="/reports/average-ticket" label="Ticket promedio" />
        <ReportRow to="/reports/sales-by-promotion" label="Descuentos por promoción" />
        <ReportRow to="/reports/manual-discounts" label="Descuentos manuales y sobre el total" />
        <ReportRow to="/reports/cash-rounding" label="Redondeo en efectivo" />
      </LinkListCard>
      {mercadoPagoChargeCostsShown ? (
        <LinkListCard title="Caja" icon={<Wallet />}>
          <ReportRow to="/reports/mercado-pago-charge-costs" label="Costos de Mercado Pago" />
        </LinkListCard>
      ) : null}
      {aiCostShown ? (
        <LinkListCard title="Compras" icon={<ShoppingCart />}>
          <ReportRow to="/reports/ai-cost-by-period" label="Costo de IA por período" />
        </LinkListCard>
      ) : null}
      <LinkListCard title="Rentabilidad" icon={<TrendingUp />}>
        <ReportRow to="/reports/margin" label="Margen por producto y por categoría" />
      </LinkListCard>
    </ScreenLayout>
  );
}
