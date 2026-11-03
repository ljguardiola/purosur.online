import {
  expectedLineTotal,
  expectedOrderTotal,
  mayBeCancelled,
  mayBeEdited,
  mayBeReceived,
  mayBeShared,
  mayBeSharedAsDocument,
} from "../model/purchase-order.js";
import { orderLineOutstandingQuantity } from "../model/purchase-order-receipt.js";
import type { PurchaseOrderDetailListing, PurchaseOrderReader } from "./purchase-order-reader.js";

export interface GetPurchaseOrderInput {
  locationId: string;
  orderId: string;
}

export type FoundPurchaseOrder = Omit<PurchaseOrderDetailListing, "lines"> & {
  lines: (PurchaseOrderDetailListing["lines"][number] & {
    expectedTotalCents: number | null;
    outstandingQuantity: number;
  })[];
  expectedTotalCents: number;
  hasUnpricedLine: boolean;
  editable: boolean;
  shareable: boolean;
  documentShareable: boolean;
  cancellable: boolean;
  receivable: boolean;
};

export type GetPurchaseOrderOutcome =
  | { kind: "found"; order: FoundPurchaseOrder }
  | { kind: "not_found" };

export async function getPurchaseOrder(
  reader: PurchaseOrderReader,
  { locationId, orderId }: GetPurchaseOrderInput,
): Promise<GetPurchaseOrderOutcome> {
  const order = await reader.order(locationId, orderId);
  if (!order) {
    return { kind: "not_found" };
  }
  return {
    kind: "found",
    order: {
      ...order,
      lines: order.lines.map((line) => ({
        ...line,
        expectedTotalCents: expectedLineTotal(line),
        outstandingQuantity: orderLineOutstandingQuantity(order.state, line, line.receivedQuantity),
      })),
      ...expectedOrderTotal(order.lines),
      editable: mayBeEdited(order.state),
      shareable: mayBeShared(order.state),
      documentShareable: mayBeSharedAsDocument(order.state),
      cancellable: mayBeCancelled(order.state),
      receivable: mayBeReceived(order.state),
    },
  };
}
