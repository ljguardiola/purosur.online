import { fetchPurchaseOrders } from "./purchase-orders-api";

export type PurchaseOrdersScreenServices = {
  fetchPurchaseOrders: typeof fetchPurchaseOrders;
};

export const defaultPurchaseOrdersScreenServices: PurchaseOrdersScreenServices = {
  fetchPurchaseOrders,
};
