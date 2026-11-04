import { compareCodeUnits } from "../../shared/index.js";
import {
  expectedOrderTotal,
  type PricedOrderLine,
  type PurchaseOrderState,
} from "./purchase-order.js";

export const PENDING_PURCHASE_ORDERS_DEFAULT_DAYS = 30;

export type PendingPurchaseOrderState = Extract<PurchaseOrderState, "SENT" | "PARTIALLY_RECEIVED">;

export interface PendingPurchaseOrderRow {
  orderId: string;
  supplierId: string;
  supplierName: string;
  state: PendingPurchaseOrderState;
  sentAt: Date;
  lines: readonly PricedOrderLine[];
}

export interface PendingPurchaseOrder {
  id: string;
  supplier: { id: string; name: string };
  state: PendingPurchaseOrderState;
  sentAt: Date;
  lineCount: number;
  expectedTotalCents: number;
  hasUnpricedLine: boolean;
}

export interface PendingPurchaseOrders {
  orders: PendingPurchaseOrder[];
  totals: {
    orders: number;
    suppliers: number;
    expectedTotalCents: number;
    hasUnpricedLine: boolean;
  };
}

export function pendingPurchaseOrders(
  rows: readonly PendingPurchaseOrderRow[],
): PendingPurchaseOrders {
  const orders = rows
    .map((row) => ({
      id: row.orderId,
      supplier: { id: row.supplierId, name: row.supplierName },
      state: row.state,
      sentAt: row.sentAt,
      lineCount: row.lines.length,
      ...expectedOrderTotal(row.lines),
    }))
    .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime() || compareCodeUnits(a.id, b.id));
  return {
    orders,
    totals: {
      orders: orders.length,
      suppliers: new Set(orders.map(({ supplier }) => supplier.id)).size,
      expectedTotalCents: orders.reduce((sum, order) => sum + order.expectedTotalCents, 0),
      hasUnpricedLine: orders.some((order) => order.hasUnpricedLine),
    },
  };
}
