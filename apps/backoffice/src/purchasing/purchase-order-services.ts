import type { CancelPurchaseOrderModalServices } from "./cancel-purchase-order-modal";
import {
  cancelPurchaseOrder,
  editPurchaseOrderLines,
  fetchPurchaseOrder,
  fetchPurchaseOrderPdf,
  fetchPurchaseOrderText,
  sharePurchaseOrder,
} from "./purchase-orders-api";
import { fetchPurchaseChoices } from "./purchases-api";
import type { SharePurchaseOrderModalServices } from "./share-purchase-order-modal";

export type PurchaseOrderScreenServices = {
  fetchPurchaseOrder: typeof fetchPurchaseOrder;
  fetchPurchaseChoices: typeof fetchPurchaseChoices;
  editPurchaseOrderLines: typeof editPurchaseOrderLines;
} & CancelPurchaseOrderModalServices &
  SharePurchaseOrderModalServices;

export const defaultPurchaseOrderScreenServices: PurchaseOrderScreenServices = {
  fetchPurchaseOrder,
  fetchPurchaseChoices,
  editPurchaseOrderLines,
  cancelPurchaseOrder,
  sharePurchaseOrder,
  fetchPurchaseOrderPdf,
  fetchPurchaseOrderText,
};
