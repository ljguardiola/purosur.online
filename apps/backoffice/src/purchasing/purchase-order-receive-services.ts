import {
  fetchPurchaseOrderReceiptDraft,
  receivePurchaseOrder,
} from "./purchase-order-receipts-api";
import { fetchPurchaseChoices } from "./purchases-api";

export type PurchaseOrderReceiveScreenServices = {
  fetchPurchaseOrderReceiptDraft: typeof fetchPurchaseOrderReceiptDraft;
  fetchPurchaseChoices: typeof fetchPurchaseChoices;
  receivePurchaseOrder: typeof receivePurchaseOrder;
};

export const defaultPurchaseOrderReceiveScreenServices: PurchaseOrderReceiveScreenServices = {
  fetchPurchaseOrderReceiptDraft,
  fetchPurchaseChoices,
  receivePurchaseOrder,
};
