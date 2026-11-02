import type { CancelPurchaseOrderModalServices } from "./cancel-purchase-order-modal";
import {
  cancelPurchaseOrder,
  editPurchaseOrderLines,
  fetchPurchaseOrder,
} from "./purchase-orders-api";
import { fetchPurchaseChoices } from "./purchases-api";

export type PurchaseOrderScreenServices = {
  fetchPurchaseOrder: typeof fetchPurchaseOrder;
  fetchPurchaseChoices: typeof fetchPurchaseChoices;
  editPurchaseOrderLines: typeof editPurchaseOrderLines;
} & CancelPurchaseOrderModalServices;

export const defaultPurchaseOrderScreenServices: PurchaseOrderScreenServices = {
  fetchPurchaseOrder,
  fetchPurchaseChoices,
  editPurchaseOrderLines,
  cancelPurchaseOrder,
};
