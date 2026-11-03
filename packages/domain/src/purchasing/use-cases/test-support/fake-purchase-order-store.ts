import type { PurchaseOrderState } from "../../model/purchase-order.js";
import type {
  LockReceivablePurchaseOrderResult,
  NewPurchaseOrderReceiptFields,
  PurchaseOrderReceiptStoreTransaction,
} from "../purchase-order-receipt-store.js";
import type {
  NewPurchaseOrderFields,
  NewPurchaseOrderLineFields,
  PurchaseOrderLineFields,
  PurchaseOrderStore,
  PurchaseOrderStoreTransaction,
  SupplierProductOffer,
} from "../purchase-order-store.js";
import type { LockProductResult, LockSupplierResult, Supplier } from "../purchasing-store.js";
import type { FakeProductRow } from "./fake-purchasing-store.js";

export interface FakePurchaseOrderRow {
  id: string;
  supplierId: string;
  locationId: string;
  state: PurchaseOrderState;
  createdAt: Date;
  actorId: string;
  cancelledAt: Date | null;
  sentAt: Date | null;
  sentBy: string | null;
  receivedAt?: Date | null;
  lines: PurchaseOrderLineFields[];
}

export interface FakePurchaseOrderReceiptRow extends NewPurchaseOrderReceiptFields {
  id: string;
}

interface FakePurchaseOrderState {
  suppliers: Supplier[];
  products: FakeProductRow[];
  offers: { supplierId: string; productId: string; offer: SupplierProductOffer }[];
  orders: FakePurchaseOrderRow[];
  receipts: FakePurchaseOrderReceiptRow[];
  nextId: number;
}

export type FakePurchaseOrderWrite =
  | "insertDraftPurchaseOrder"
  | "insertPurchaseOrderLine"
  | "replacePurchaseOrderLines"
  | "cancelPurchaseOrder"
  | "markPurchaseOrderSent"
  | "insertPurchaseOrderReceipt"
  | "markPurchaseOrderReceived";

export function fakeOrderLineId(orderId: string, position: number): string {
  return `${orderId}-line-${position}`;
}

function cloneOrder(order: FakePurchaseOrderRow): FakePurchaseOrderRow {
  return {
    ...order,
    createdAt: new Date(order.createdAt),
    cancelledAt: order.cancelledAt && new Date(order.cancelledAt),
    sentAt: order.sentAt && new Date(order.sentAt),
    ...(order.receivedAt === undefined
      ? {}
      : { receivedAt: order.receivedAt && new Date(order.receivedAt) }),
    lines: order.lines.map((line) => ({ ...line })),
  };
}

function cloneReceipt(receipt: FakePurchaseOrderReceiptRow): FakePurchaseOrderReceiptRow {
  return {
    ...receipt,
    receivedAt: new Date(receipt.receivedAt),
    lines: receipt.lines.map((line) => ({ ...line })),
  };
}

function cloneState(state: FakePurchaseOrderState): FakePurchaseOrderState {
  return {
    suppliers: state.suppliers.map((row) => ({ ...row })),
    products: state.products.map((row) => ({ ...row })),
    offers: state.offers.map((row) => ({
      ...row,
      offer: { ...row.offer, link: { ...row.offer.link } },
    })),
    orders: state.orders.map(cloneOrder),
    receipts: state.receipts.map(cloneReceipt),
    nextId: state.nextId,
  };
}

class FakePurchaseOrderStoreTransaction
  implements
    PurchaseOrderStoreTransaction,
    Pick<
      PurchaseOrderReceiptStoreTransaction,
      "receivedQuantities" | "insertPurchaseOrderReceipt" | "markPurchaseOrderReceived"
    >
{
  private readonly state: FakePurchaseOrderState;
  private readonly store: FakePurchaseOrderStore;

  constructor(state: FakePurchaseOrderState, store: FakePurchaseOrderStore) {
    this.state = state;
    this.store = store;
  }

  async lockSupplier(supplierId: string): Promise<LockSupplierResult> {
    this.store.lockLog.push(`supplier:${supplierId}`);
    const supplier = this.state.suppliers.find((row) => row.id === supplierId);
    return supplier ? { kind: "locked", supplier: { ...supplier } } : { kind: "not_found" };
  }

  async holdPurchasedProduct(productId: string): Promise<LockProductResult> {
    this.store.lockLog.push(`product:${productId}`);
    const product = this.state.products.find((row) => row.id === productId);
    return product
      ? {
          kind: "locked",
          product: { id: product.id, saleUnit: product.saleUnit, active: product.active },
        }
      : { kind: "not_found" };
  }

  async supplierOffers(supplierId: string, productId: string): Promise<SupplierProductOffer[]> {
    return this.state.offers
      .filter((offer) => offer.supplierId === supplierId && offer.productId === productId)
      .map((row) => ({ ...row.offer, link: { ...row.offer.link } }));
  }

  async insertDraftPurchaseOrder(fields: NewPurchaseOrderFields): Promise<{ id: string }> {
    this.beforeWrite("insertDraftPurchaseOrder");
    const id = `order-${this.state.nextId++}`;
    this.state.orders.push({
      id,
      supplierId: fields.supplierId,
      locationId: fields.locationId,
      state: "DRAFT",
      createdAt: fields.createdAt,
      actorId: fields.actorId,
      cancelledAt: null,
      sentAt: null,
      sentBy: null,
      lines: [],
    });
    return { id };
  }

  async insertPurchaseOrderLine(fields: NewPurchaseOrderLineFields): Promise<void> {
    this.beforeWrite("insertPurchaseOrderLine");
    const order = this.state.orders.find((row) => row.id === fields.purchaseOrderId);
    const { purchaseOrderId: _purchaseOrderId, position: _position, ...line } = fields;
    if (order) {
      order.lines[fields.position - 1] = line;
    }
  }

  async lockPurchaseOrder(
    locationId: string,
    orderId: string,
  ): Promise<LockReceivablePurchaseOrderResult> {
    this.store.lockLog.push(`order:${orderId}`);
    const order = this.state.orders.find(
      (row) => row.id === orderId && row.locationId === locationId,
    );
    return order
      ? {
          kind: "locked",
          order: {
            id: order.id,
            supplierId: order.supplierId,
            state: order.state,
            lines: order.lines.map((line, index) => ({
              ...line,
              id: fakeOrderLineId(order.id, index + 1),
            })),
          },
        }
      : { kind: "not_found" };
  }

  async replacePurchaseOrderLines(
    orderId: string,
    lines: readonly PurchaseOrderLineFields[],
  ): Promise<void> {
    this.beforeWrite("replacePurchaseOrderLines");
    for (const order of this.state.orders) {
      if (order.id === orderId) {
        order.lines = lines.map((line) => ({ ...line }));
      }
    }
  }

  async cancelPurchaseOrder(
    orderId: string,
    cancellation: { cancelledAt: Date; actorId: string },
  ): Promise<void> {
    this.beforeWrite("cancelPurchaseOrder");
    for (const order of this.state.orders) {
      if (order.id === orderId) {
        order.state = "CANCELLED";
        order.cancelledAt = cancellation.cancelledAt;
      }
    }
  }

  async markPurchaseOrderSent(
    orderId: string,
    sending: { sentAt: Date; actorId: string },
  ): Promise<void> {
    this.beforeWrite("markPurchaseOrderSent");
    for (const order of this.state.orders) {
      if (order.id === orderId) {
        order.state = "SENT";
        order.sentAt = sending.sentAt;
        order.sentBy = sending.actorId;
      }
    }
  }

  async receivedQuantities(orderId: string): Promise<Map<string, number>> {
    const quantities = new Map<string, number>();
    for (const receipt of this.state.receipts) {
      if (receipt.purchaseOrderId === orderId) {
        for (const line of receipt.lines) {
          quantities.set(
            line.purchaseOrderLineId,
            (quantities.get(line.purchaseOrderLineId) ?? 0) + line.receivedQuantity,
          );
        }
      }
    }
    return quantities;
  }

  async insertPurchaseOrderReceipt(fields: NewPurchaseOrderReceiptFields): Promise<void> {
    this.beforeWrite("insertPurchaseOrderReceipt");
    this.state.receipts.push(
      cloneReceipt({
        ...fields,
        id: `order-receipt-${this.state.nextId++}`,
        lines: [...fields.lines],
      }),
    );
  }

  async markPurchaseOrderReceived(
    orderId: string,
    receiving: { state: "PARTIALLY_RECEIVED" | "RECEIVED"; receivedAt: Date },
  ): Promise<void> {
    this.beforeWrite("markPurchaseOrderReceived");
    for (const order of this.state.orders) {
      if (order.id === orderId) {
        order.state = receiving.state;
        order.receivedAt = receiving.receivedAt;
      }
    }
  }

  private beforeWrite(operation: FakePurchaseOrderWrite): void {
    if (this.store.writeFailsAtCall(operation)) {
      throw new Error(`${operation} failed`);
    }
  }
}

export class FakePurchaseOrderStore implements PurchaseOrderStore {
  private state: FakePurchaseOrderState = {
    suppliers: [],
    products: [],
    offers: [],
    orders: [],
    receipts: [],
    nextId: 1,
  };

  private readonly failingCalls = new Map<FakePurchaseOrderWrite, number>();
  private readonly writeCalls = new Map<FakePurchaseOrderWrite, number>();

  lockLog: string[] = [];
  transactionCount = 0;

  seedSupplier(supplier: Supplier): void {
    this.state.suppliers.push({ ...supplier });
  }

  seedProduct(product: FakeProductRow): void {
    this.state.products.push({ ...product });
  }

  seedOffer(supplierId: string, productId: string, offer: SupplierProductOffer): void {
    this.state.offers.push({ supplierId, productId, offer });
  }

  seedOrder(order: FakePurchaseOrderRow): void {
    this.state.orders.push(cloneOrder(order));
  }

  seedReceipt(receipt: FakePurchaseOrderReceiptRow): void {
    this.state.receipts.push(cloneReceipt(receipt));
  }

  receipts(): FakePurchaseOrderReceiptRow[] {
    return this.state.receipts.map(cloneReceipt);
  }

  failWriteAtCall(operation: FakePurchaseOrderWrite, call: number): void {
    this.failingCalls.set(operation, call);
  }

  writeFailsAtCall(operation: FakePurchaseOrderWrite): boolean {
    const call = (this.writeCalls.get(operation) ?? 0) + 1;
    this.writeCalls.set(operation, call);
    return this.failingCalls.get(operation) === call;
  }

  orders(): FakePurchaseOrderRow[] {
    return this.state.orders.map(cloneOrder);
  }

  async transaction<TOutcome>(
    work: (
      tx: Omit<PurchaseOrderStoreTransaction, "lockPurchaseOrder"> &
        Pick<
          PurchaseOrderReceiptStoreTransaction,
          | "lockPurchaseOrder"
          | "receivedQuantities"
          | "insertPurchaseOrderReceipt"
          | "markPurchaseOrderReceived"
        >,
    ) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactionCount += 1;
    const before = cloneState(this.state);
    try {
      return await work(new FakePurchaseOrderStoreTransaction(this.state, this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}
