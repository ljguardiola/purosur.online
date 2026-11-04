import { fetchPendingPurchaseOrdersReport } from "./pending-purchase-orders-report-api";

export type PendingPurchaseOrdersReportScreenServices = {
  fetchPendingPurchaseOrdersReport: typeof fetchPendingPurchaseOrdersReport;
};

export const defaultPendingPurchaseOrdersReportScreenServices: PendingPurchaseOrdersReportScreenServices =
  { fetchPendingPurchaseOrdersReport };
