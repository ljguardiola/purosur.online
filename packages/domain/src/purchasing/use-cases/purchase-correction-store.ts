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
  productId: string;
  expiresOn: string | null;
  costPaidCents: number;
  quantity: number;
  packages: number | null;
  quantityPerPackage: number;
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
  | {
      kind: "line_expiry_split";
      lineId: string;
      quantity: number;
      previous: string | null;
      next: string | null;
    }
  | { kind: "line_cost"; lineId: string; previous: number; next: number }
  | {
      kind: "line_quantity";
      lineId: string;
      previous: PurchaseLineQuantity;
      next: PurchaseLineQuantity;
    }
  | { kind: "line_product"; lineId: string; previous: string; next: string }
  | {
      kind: "line_removed";
      lineId: string;
      productId: string;
      quantity: number;
      packages: number | null;
      costPaidCents: number;
      expiresOn: string | null;
    };

export interface PurchaseLineQuantity {
  quantity: number;
  packages: number | null;
}

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

export interface LotExpirySplit {
  locationId: string;
  purchaseLineId: string;
  quantity: number;
  expiresOn: string | null;
  occurredAt: Date;
  actorId: string;
}

export type LotExpirySplitResult =
  | { kind: "invalid_quantity" }
  | { kind: "not_enough_in_lot" }
  | { kind: "split"; lotId: string };

export interface LotQuantityCorrection {
  locationId: string;
  purchaseLineId: string;
  delta: number;
  actorId: string;
}

export type LotQuantityCorrectionResult =
  | { kind: "invalid_quantity" }
  | { kind: "not_enough_in_lot" }
  | { kind: "corrected" };

export interface LotsMove {
  locationId: string;
  purchaseLineId: string;
  productId: string;
  actorId: string;
}

export type LotsMoveResult =
  | { kind: "counted_since_receipt" }
  | { kind: "units_left_lot" }
  | { kind: "moved" };

export interface LotsWithdrawal {
  locationId: string;
  purchaseLineId: string;
  actorId: string;
}

export type LotsWithdrawalResult =
  | { kind: "counted_since_receipt" }
  | { kind: "units_left_lot" }
  | { kind: "withdrawn" };

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
  // The line is answered only when it belongs to the purchase and was not removed.
  purchaseLine(purchaseId: string, lineId: string): Promise<LockedPurchaseLine | undefined>;
  // The lines of the purchase that were not removed.
  purchaseLineIds(purchaseId: string): Promise<string[]>;
  updatePurchaseHeader(purchaseId: string, values: PurchaseHeaderValues): Promise<void>;
  updatePurchaseLineExpiry(lineId: string, expiresOn: string | null): Promise<void>;
  updatePurchaseLineCost(lineId: string, costPaidCents: number): Promise<void>;
  updatePurchaseLineQuantity(
    lineId: string,
    quantity: number,
    packages: number | null,
  ): Promise<void>;
  updatePurchaseLineProduct(lineId: string, productId: string): Promise<void>;
  // The line no longer counts among the purchase's lines; the row stays for the history.
  markPurchaseLineRemoved(lineId: string, removedAt: Date): Promise<void>;
  // Moves the lots the purchase line created, with their units, cost and expiry dates, to the
  // product.
  moveLineLots(move: LotsMove): Promise<LotsMoveResult>;
  // Takes the lots the purchase line created, and their units, out of stock.
  withdrawLineLots(withdrawal: LotsWithdrawal): Promise<LotsWithdrawalResult>;
  // Corrects the cost of every lot the purchase line created, keeping the cost each had until then.
  correctLotCost(correction: LotCostCorrection): Promise<void>;
  // Corrects the expiry date of the lot the purchase line created.
  correctLotExpiry(correction: LotExpiryCorrection): Promise<void>;
  // Moves units of the lot the purchase line created into a lot of their own with the expiry date.
  splitLotExpiry(split: LotExpirySplit): Promise<LotExpirySplitResult>;
  // Adds the units, or takes them away when negative, from the lot the purchase line created.
  correctLotQuantity(correction: LotQuantityCorrection): Promise<LotQuantityCorrectionResult>;
  // Dates the lots the purchase lines created by the purchase's corrected date.
  redatePurchasedLots(redating: PurchasedLotsRedating): Promise<void>;
  recordPurchaseCorrection(correction: PurchaseCorrection): Promise<void>;
}

export interface PurchaseCorrectionStore {
  transaction<TOutcome>(
    work: (tx: PurchaseCorrectionStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}
