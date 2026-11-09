import { AreaTopBar } from "../shell/area-top-bar";
import type { ReportPeriodFilters } from "../shell/report-filters-search";
import { ScreenLayout } from "../shell/screen-layout";
import {
  PENDING_PURCHASE_ORDERS_REPORT_TITLE,
  PendingPurchaseOrdersReportContent,
} from "./pending-purchase-orders-report-content";
import type { PendingPurchaseOrdersReportScreenServices } from "./pending-purchase-orders-report-services";

export type PendingPurchaseOrdersReportScreenProps = {
  filters: ReportPeriodFilters;
  mayOpenOrders: boolean;
  onFiltersChange: (filters: ReportPeriodFilters) => void;
  onOpenOrder: (orderId: string) => void;
  onSessionEnded: () => void;
  services: PendingPurchaseOrdersReportScreenServices;
};

export function PendingPurchaseOrdersReportScreen({
  mayOpenOrders,
  onOpenOrder,
  ...content
}: PendingPurchaseOrdersReportScreenProps) {
  return (
    <ScreenLayout
      topBar={
        <AreaTopBar eyebrow="Reportes · Compras" title={PENDING_PURCHASE_ORDERS_REPORT_TITLE} />
      }
      bodyClassName="gap-4 p-6"
    >
      <PendingPurchaseOrdersReportContent
        {...content}
        onOpenOrder={mayOpenOrders ? onOpenOrder : undefined}
      />
    </ScreenLayout>
  );
}
