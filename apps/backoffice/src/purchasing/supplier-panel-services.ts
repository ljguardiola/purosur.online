import { fetchFreights } from "./freights-api";
import { fetchPurchaseOrders } from "./purchase-orders-api";
import { fetchPurchases } from "./purchases-api";
import { fetchSupplierPriceLists } from "./supplier-price-lists-api";

export type SupplierPanelServices = {
  fetchSupplierPriceLists: typeof fetchSupplierPriceLists;
  fetchPurchaseOrders: typeof fetchPurchaseOrders;
  fetchPurchases: typeof fetchPurchases;
  fetchFreights: typeof fetchFreights;
};

export const defaultSupplierPanelServices: SupplierPanelServices = {
  fetchSupplierPriceLists,
  fetchPurchaseOrders,
  fetchPurchases,
  fetchFreights,
};
