import type { PurchaseOrderDetailListing, PurchaseOrderReader } from "./purchase-order-reader.js";

export interface GetPurchaseOrderInput {
  locationId: string;
  orderId: string;
}

export type GetPurchaseOrderOutcome =
  | { kind: "found"; order: PurchaseOrderDetailListing }
  | { kind: "not_found" };

export async function getPurchaseOrder(
  reader: PurchaseOrderReader,
  { locationId, orderId }: GetPurchaseOrderInput,
): Promise<GetPurchaseOrderOutcome> {
  const order = await reader.order(locationId, orderId);
  return order ? { kind: "found", order } : { kind: "not_found" };
}
