import { expectedOrderTotal, type PurchaseOrderState } from "../model/purchase-order.js";
import type { PurchaseOrderReader } from "./purchase-order-reader.js";

export interface ListPurchaseOrdersInput {
  locationId: string;
  state?: PurchaseOrderState;
}

export interface ListedPurchaseOrder {
  id: string;
  supplier: { id: string; name: string };
  state: PurchaseOrderState;
  createdAt: Date;
  lineCount: number;
  expectedTotalCents: number;
  hasUnpricedLine: boolean;
}

export async function listPurchaseOrders(
  reader: PurchaseOrderReader,
  { locationId, state }: ListPurchaseOrdersInput,
): Promise<ListedPurchaseOrder[]> {
  const orders = await reader.orders(locationId, state);
  return orders.map(({ lines, ...order }) => ({
    ...order,
    lineCount: lines.length,
    ...expectedOrderTotal(lines),
  }));
}
