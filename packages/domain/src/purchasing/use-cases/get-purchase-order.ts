import {
  expectedLineTotal,
  expectedOrderTotal,
  mayBeCancelled,
  mayBeEdited,
} from "../model/purchase-order.js";
import type { PurchaseOrderDetailListing, PurchaseOrderReader } from "./purchase-order-reader.js";

export interface GetPurchaseOrderInput {
  locationId: string;
  orderId: string;
}

export type FoundPurchaseOrder = Omit<PurchaseOrderDetailListing, "lines"> & {
  lines: (PurchaseOrderDetailListing["lines"][number] & { expectedTotalCents: number | null })[];
  expectedTotalCents: number;
  hasUnpricedLine: boolean;
  editable: boolean;
  cancellable: boolean;
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
      lines: order.lines.map((line) => ({ ...line, expectedTotalCents: expectedLineTotal(line) })),
      ...expectedOrderTotal(order.lines),
      editable: mayBeEdited(order.state),
      cancellable: mayBeCancelled(order.state),
    },
  };
}
