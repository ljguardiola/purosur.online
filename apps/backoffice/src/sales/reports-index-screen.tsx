import { LinkListCard, LinkListRow } from "@purosur/ui";
import { createLink } from "@tanstack/react-router";
import { FileText, ShoppingBag, ShoppingCart, Tag, Wallet, Warehouse } from "lucide-react";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTopBar } from "../shell/screen-top-bar";

const ReportRow = createLink(LinkListRow);

export function ReportsIndexScreen({ returnsShown }: { returnsShown: boolean }) {
  return (
    <ScreenLayout topBar={<ScreenTopBar eyebrow="Puro Sur" title="Reportes" />} bodyClassName="p-6">
      <LinkListCard title="Ventas" icon={<ShoppingBag />}>
        <ReportRow to="/reports/sales-by-day" label="Ventas por día o por rango" />
        <ReportRow to="/reports/sales-by-payment-method" label="Ventas por medio de pago" />
        <ReportRow
          to="/reports/sales-by-product-and-category"
          label="Ventas por producto y por categoría"
        />
        <ReportRow to="/reports/sales-by-cashier" label="Ventas por cajero" />
        <ReportRow to="/reports/hand-typed-weights" label="Pesos tipeados a mano" />
        <ReportRow
          to="/reports/removed-lines-and-cancelled-sales"
          label="Líneas quitadas y ventas canceladas"
        />
        <ReportRow to="/reports/average-ticket" label="Ticket promedio" />
        <ReportRow to="/reports/sales-by-promotion" label="Descuentos por promoción" />
        <ReportRow to="/reports/manual-discounts" label="Descuentos manuales y sobre el total" />
      </LinkListCard>
      <LinkListCard title="Caja" icon={<Wallet />}>
        <ReportRow to="/reports/hand-confirmed-payments" label="Pagos confirmados a mano" />
        <ReportRow to="/reports/cash-session-closes" label="Cierres de sesión" />
        <ReportRow to="/reports/cash-movements" label="Movimientos de caja" />
        {returnsShown ? <ReportRow to="/reports/returns" label="Devoluciones" /> : null}
      </LinkListCard>
      <LinkListCard title="Fiscal" icon={<FileText />}>
        <ReportRow to="/reports/fiscal-documents" label="Comprobantes emitidos" />
      </LinkListCard>
      <LinkListCard title="Compras" icon={<ShoppingCart />}>
        <ReportRow to="/reports/purchases-by-supplier" label="Compras por proveedor" />
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
