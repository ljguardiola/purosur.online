import type { PurchaseOrderStoreTransaction } from "./purchase-order-store.js";
import type { PurchaseRecordingTransaction } from "./purchase-recording.js";

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

export interface PurchaseOrderReceiptStoreTransaction
  extends PurchaseRecordingTransaction,
    Pick<PurchaseOrderStoreTransaction, "lockPurchaseOrder" | "supplierOffers"> {
  // The quantity earlier receipts brought for each order line, by the line's id.
  receivedQuantities(orderId: string): Promise<Map<string, number>>;
  insertPurchaseOrderReceipt(fields: NewPurchaseOrderReceiptFields): Promise<void>;
  markPurchaseOrderReceived(
    orderId: string,
    receiving: { state: "PARTIALLY_RECEIVED" | "RECEIVED"; receivedAt: Date },
  ): Promise<void>;
}

export interface PurchaseOrderReceiptStore {
  transaction<TOutcome>(
    work: (tx: PurchaseOrderReceiptStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}
