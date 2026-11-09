import type { PagePart } from "../platform/page-parts";
import {
  type BackofficeAccess,
  canComparePrices,
  canReadPurchaseOrders,
} from "../shell/backoffice-access";

export type PurchaseOrdersTab = "orders" | "suggestion" | "comparison";

export const PURCHASE_ORDERS_TABS: readonly PagePart<BackofficeAccess, PurchaseOrdersTab>[] = [
  { key: "orders", isVisibleTo: canReadPurchaseOrders },
  { key: "suggestion", isVisibleTo: canComparePrices },
  { key: "comparison", isVisibleTo: canComparePrices },
];

export const PURCHASE_ORDERS_TAB_TARGETS = {
  orders: "/purchase-orders",
  suggestion: "/purchase-orders/suggestion",
  comparison: "/purchase-orders/comparison",
} as const;
