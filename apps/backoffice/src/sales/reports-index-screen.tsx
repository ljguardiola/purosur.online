import { LinkListCard, LinkListRow } from "@purosur/ui";
import { createLink } from "@tanstack/react-router";
import { Banknote, ShoppingBag } from "lucide-react";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTopBar } from "../shell/screen-top-bar";

const ReportRow = createLink(LinkListRow);

export function ReportsIndexScreen() {
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
        <ReportRow to="/reports/average-ticket" label="Ticket promedio" />
      </LinkListCard>
      <LinkListCard title="Caja" icon={<Banknote />}>
        <ReportRow to="/reports/hand-confirmed-payments" label="Pagos confirmados a mano" />
      </LinkListCard>
    </ScreenLayout>
  );
}
