import type {
  PurchaseOrderDetailListing,
  PurchaseOrderListing,
  PurchaseOrderReader,
} from "../purchase-order-reader.js";
import type { PurchaseOrderState } from "../../model/purchase-order.js";

export type FakePurchaseOrder = PurchaseOrderDetailListing & { locationId: string };

export class FakePurchaseOrderReader implements PurchaseOrderReader {
  private readonly stored: FakePurchaseOrder[];

  constructor(orders: FakePurchaseOrder[] = []) {
    this.stored = orders;
  }

  async orders(locationId: string, state?: PurchaseOrderState): Promise<PurchaseOrderListing[]> {
    return this.stored
      .filter((order) => order.locationId === locationId)
      .filter((order) => state === undefined || order.state === state)
      .sort((first, second) => second.createdAt.getTime() - first.createdAt.getTime())
      .map(({ id, supplier, state: orderState, createdAt, lines }) => ({
        id,
        supplier,
        state: orderState,
        createdAt,
        lines: lines.map(({ packages, expectedPackagePriceCents }) => ({
          packages,
          expectedPackagePriceCents,
        })),
      }));
  }

  async order(
    locationId: string,
    orderId: string,
  ): Promise<PurchaseOrderDetailListing | undefined> {
    const order = this.stored.find((row) => row.id === orderId && row.locationId === locationId);
    if (!order) {
      return undefined;
    }
    const { locationId: _locationId, ...detail } = order;
    return detail;
  }
}
