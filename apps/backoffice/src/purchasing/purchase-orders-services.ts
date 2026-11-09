import {
  defaultPurchaseOrderPanelServices,
  type PurchaseOrderPanelServices,
} from "./purchase-order-panel-services";
import { fetchPurchaseOrders } from "./purchase-orders-api";
import type { SupplierFilterServices } from "./purchasing-screen-parts";
import { fetchSupplierName } from "./suppliers-api";

export type PurchaseOrdersScreenServices = {
  fetchPurchaseOrders: typeof fetchPurchaseOrders;
} & SupplierFilterServices &
  PurchaseOrderPanelServices;

export const defaultPurchaseOrdersScreenServices: PurchaseOrdersScreenServices = {
  fetchPurchaseOrders,
  fetchSupplierName,
  ...defaultPurchaseOrderPanelServices,
};
