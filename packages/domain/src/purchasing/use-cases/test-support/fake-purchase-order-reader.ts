import type { PurchaseOrderState } from "../../model/purchase-order.js";
import type {
  PurchaseOrderDetailListing,
  PurchaseOrderListing,
  PurchaseOrderReader,
  ReceivableOrderListing,
} from "../purchase-order-reader.js";

export type FakePurchaseOrder = PurchaseOrderDetailListing & { locationId: string };

export type FakeReceivableOrder = ReceivableOrderListing & { locationId: string };

export class FakePurchaseOrderReader implements PurchaseOrderReader {
  private readonly stored: FakePurchaseOrder[];
  private readonly receivable: FakeReceivableOrder[];

  constructor(orders: FakePurchaseOrder[] = [], receivable: FakeReceivableOrder[] = []) {
    this.stored = orders;
    this.receivable = receivable;
  }

  async receivableOrder(
    locationId: string,
    orderId: string,
  ): Promise<ReceivableOrderListing | undefined> {
    const order = this.receivable.find(
      (row) => row.id === orderId && row.locationId === locationId,
    );
    if (!order) {
      return undefined;
    }
    const { locationId: _locationId, ...listing } = order;
    return listing;
  }

  async orders(
    locationId: string,
    state?: PurchaseOrderState,
    supplierId?: string,
  ): Promise<PurchaseOrderListing[]> {
    return this.stored
      .filter((order) => order.locationId === locationId)
      .filter((order) => state === undefined || order.state === state)
      .filter((order) => supplierId === undefined || order.supplier.id === supplierId)
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
