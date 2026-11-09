import { fetchPendingPurchaseOrdersReport } from "./pending-purchase-orders-report-api";
import {
  defaultPurchaseOrderPanelServices,
  type PurchaseOrderPanelServices,
} from "./purchase-order-panel-services";
import { fetchPurchaseOrders } from "./purchase-orders-api";
import type { SupplierFilterServices } from "./purchasing-screen-parts";
import { fetchReceiptDifferencesReport } from "./receipt-differences-report-api";
import { fetchSupplierName } from "./suppliers-api";

export type PurchaseOrdersScreenServices = {
  fetchPurchaseOrders: typeof fetchPurchaseOrders;
  fetchPendingPurchaseOrdersReport: typeof fetchPendingPurchaseOrdersReport;
  fetchReceiptDifferencesReport: typeof fetchReceiptDifferencesReport;
} & SupplierFilterServices &
  PurchaseOrderPanelServices;

export const defaultPurchaseOrdersScreenServices: PurchaseOrdersScreenServices = {
  fetchPurchaseOrders,
  fetchPendingPurchaseOrdersReport,
  fetchReceiptDifferencesReport,
  fetchSupplierName,
  ...defaultPurchaseOrderPanelServices,
};
