import { LinkListCard, LinkListRow } from "@purosur/ui";
import { createLink } from "@tanstack/react-router";
import {
  FileText,
  ShoppingBag,
  ShoppingCart,
  Tag,
  TrendingUp,
  Wallet,
  Warehouse,
} from "lucide-react";
import { AreaTopBar } from "../shell/area-top-bar";
import { ScreenLayout } from "../shell/screen-layout";

const ReportRow = createLink(LinkListRow);

export function ReportsIndexScreen({ aiCostShown }: { aiCostShown: boolean }) {
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
      <LinkListCard title="Caja" icon={<Wallet />}>
        <ReportRow to="/reports/hand-confirmed-payments" label="Pagos confirmados a mano" />
      </LinkListCard>
      <LinkListCard title="Fiscal" icon={<FileText />}>
        <ReportRow to="/reports/fiscal-documents" label="Comprobantes emitidos" />
      </LinkListCard>
      <LinkListCard title="Compras" icon={<ShoppingCart />}>
        <ReportRow to="/reports/purchases-by-supplier" label="Compras por proveedor" />
        <ReportRow to="/reports/freight-by-period" label="Flete por período" />
        <ReportRow to="/reports/pending-purchase-orders" label="Pedidos pendientes de recibir" />
        <ReportRow to="/reports/receipt-differences" label="Diferencias de recepción" />
        {aiCostShown ? (
          <ReportRow to="/reports/ai-cost-by-period" label="Costo de IA por período" />
        ) : null}
      </LinkListCard>
      <LinkListCard title="Rentabilidad" icon={<TrendingUp />}>
        <ReportRow to="/reports/margin" label="Margen por producto y por categoría" />
      </LinkListCard>
      <LinkListCard title="Precios" icon={<Tag />}>
        <ReportRow to="/reports/prices-past-review-deadline" label="Precios sin revisar" />
      </LinkListCard>
      <LinkListCard title="Stock" icon={<Warehouse />}>
        <ReportRow to="/reports/current-stock" label="Stock actual valorizado" />
        <ReportRow to="/reports/expiring-lots" label="Lotes por vencer" />
        <ReportRow to="/reports/losses-by-reason" label="Mermas por motivo" />
      </LinkListCard>
    </ScreenLayout>
  );
}
