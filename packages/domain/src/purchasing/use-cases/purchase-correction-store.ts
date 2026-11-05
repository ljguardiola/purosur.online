import type { PriceReviewPostponement } from "../../pricing/index.js";
import type { PurchaseReceipt } from "../../stock/index.js";
import type { ReceiptType } from "../model/purchase.js";
import type { LockProductResult, NewPurchaseLineFields } from "./purchasing-store.js";

export interface PurchaseHeaderValues {
  purchasedOn: string;
  receiptType: ReceiptType;
  receiptNumber: string | null;
  note: string | null;
}

export interface LockedPurchase extends PurchaseHeaderValues {
  id: string;
  lastLinePosition: number;
}

export interface LockedPurchaseLine {
  id: string;
  expiresOn: string | null;
  costPaidCents: number;
}

export type LockPurchaseResult =
  | { kind: "not_found" }
  | { kind: "locked"; purchase: LockedPurchase };

export type PurchaseHeaderChange =
  | { field: "purchasedOn"; previous: string; next: string }
  | { field: "receiptType"; previous: ReceiptType; next: ReceiptType }
  | { field: "receiptNumber"; previous: string | null; next: string | null }
  | { field: "note"; previous: string | null; next: string | null };

export interface AddedLineRecord {
  lineId: string;
  productId: string;
  quantity: number;
  costPaidCents: number;
  expiresOn: string | null;
}

export type PurchaseCorrectionChange =
  | { kind: "header"; changes: PurchaseHeaderChange[] }
  | { kind: "lines_added"; lines: AddedLineRecord[] }
  | { kind: "line_expiry"; lineId: string; previous: string | null; next: string | null }
  | { kind: "line_cost"; lineId: string; previous: number; next: number };

export interface PurchaseCorrection {
  purchaseId: string;
  actorId: string;
  correctedAt: Date;
  change: PurchaseCorrectionChange;
}

export interface LotExpiryCorrection {
  locationId: string;
  purchaseLineId: string;
  expiresOn: string | null;
}

export interface LotCostCorrection {
  locationId: string;
  purchaseLineId: string;
  costPaidCents: number;
  changedAt: Date;
}

export interface PurchasedLotsRedating {
  locationId: string;
  purchaseLineIds: string[];
  purchasedOn: string;
}

export interface PurchaseCorrectionStoreTransaction {
  // Holds the product's row against a change of it while movements of its stock, which reference
  // it, may still be recorded.
  holdPurchasedProduct(productId: string): Promise<LockProductResult>;
  insertPurchaseLine(fields: NewPurchaseLineFields): Promise<{ id: string }>;
  postponePriceReviews(postponement: PriceReviewPostponement): Promise<void>;
  receiveStock(receipt: PurchaseReceipt): Promise<void>;
  // Holds the purchase's row, so two corrections of it never interleave. A purchase of another
  // branch is not found.
  lockPurchase(locationId: string, purchaseId: string): Promise<LockPurchaseResult>;
  // The line is answered only when it belongs to the purchase.
  purchaseLine(purchaseId: string, lineId: string): Promise<LockedPurchaseLine | undefined>;
  purchaseLineIds(purchaseId: string): Promise<string[]>;
  updatePurchaseHeader(purchaseId: string, values: PurchaseHeaderValues): Promise<void>;
  updatePurchaseLineExpiry(lineId: string, expiresOn: string | null): Promise<void>;
  updatePurchaseLineCost(lineId: string, costPaidCents: number): Promise<void>;
  // Corrects the cost of the lot the purchase line created, keeping the cost it had until then.
  correctLotCost(correction: LotCostCorrection): Promise<void>;
  // Corrects the expiry date of the lot the purchase line created.
  correctLotExpiry(correction: LotExpiryCorrection): Promise<void>;
  // Dates the lots the purchase lines created by the purchase's corrected date.
  redatePurchasedLots(redating: PurchasedLotsRedating): Promise<void>;
  recordPurchaseCorrection(correction: PurchaseCorrection): Promise<void>;
}

export interface PurchaseCorrectionStore {
  transaction<TOutcome>(
    work: (tx: PurchaseCorrectionStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}
