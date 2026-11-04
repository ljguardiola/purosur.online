import type {
  LockedPurchaseOrder,
  PurchaseOrderLineFields,
  PurchaseOrderStoreTransaction,
} from "./purchase-order-store.js";
import type { PurchaseRecordingTransaction } from "./purchase-recording.js";

export interface ReceivablePurchaseOrderLine extends PurchaseOrderLineFields {
  id: string;
}

export interface ReceivablePurchaseOrder extends Omit<LockedPurchaseOrder, "lines"> {
  lines: ReceivablePurchaseOrderLine[];
}

export type LockReceivablePurchaseOrderResult =
  | { kind: "not_found" }
  | { kind: "locked"; order: ReceivablePurchaseOrder };

export interface PurchaseOrderReceiptLineFields {
  purchaseOrderLineId: string;
  receivedQuantity: number;
  missingQuantity: number;
  priceDifferenceCents: number | null;
}

export interface NewPurchaseOrderReceiptFields {
  purchaseOrderId: string;
  purchaseId: string;
  actorId: string;
  receivedAt: Date;
  lines: readonly PurchaseOrderReceiptLineFields[];
}

export type PurchaseOrderReceiving =
  | { state: "PARTIALLY_RECEIVED"; receivedAt: null }
  | { state: "RECEIVED"; receivedAt: Date };

export interface PurchaseOrderReceiptStoreTransaction
  extends PurchaseRecordingTransaction,
    Pick<PurchaseOrderStoreTransaction, "supplierOffers"> {
  // Holds the row of an order of the branch; an order of another branch is not found.
  lockPurchaseOrder(
    locationId: string,
    orderId: string,
  ): Promise<LockReceivablePurchaseOrderResult>;
  // The quantity earlier receipts brought for each order line, by the line's id.
  receivedQuantities(orderId: string): Promise<Map<string, number>>;
  insertPurchaseOrderReceipt(fields: NewPurchaseOrderReceiptFields): Promise<void>;
  markPurchaseOrderReceived(orderId: string, receiving: PurchaseOrderReceiving): Promise<void>;
}

export interface PurchaseOrderReceiptStore {
  transaction<TOutcome>(
    work: (tx: PurchaseOrderReceiptStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}
