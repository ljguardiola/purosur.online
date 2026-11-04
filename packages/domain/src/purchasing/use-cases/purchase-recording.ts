import type { SaleUnit } from "../../catalog/index.js";
import { mayBePurchasedFrom, type ReceiptType } from "../model/purchase.js";
import {
  holdAndResolveLines,
  type LineRefusal,
  type RegisteredPurchaseLine,
  type RegisterPurchaseLine,
  recordPurchaseLines,
} from "./purchase-line-resolution.js";
import type { PurchasingStoreTransaction } from "./purchasing-store.js";

export type PurchaseRecordingTransaction = Pick<
  PurchasingStoreTransaction,
  | "lockSupplier"
  | "holdPurchasedProduct"
  | "insertPurchase"
  | "insertPurchaseLine"
  | "postponePriceReviews"
  | "receiveStock"
>;

export interface PurchaseToRecord {
  supplierId: string;
  locationId: string;
  purchasedOn: string;
  receiptType: ReceiptType;
  receiptNumber: string | null;
  note: string | null;
  lines: readonly RegisterPurchaseLine[];
  actorId: string;
}

export interface RecordedPurchase {
  id: string;
  supplierId: string;
  locationId: string;
  purchasedOn: string;
  receiptType: ReceiptType;
  receiptNumber: string | null;
  note: string | null;
  recordedAt: Date;
  lines: RegisteredPurchaseLine[];
}

export type PurchaseRecordingOutcome =
  | { kind: "supplier_not_found" }
  | { kind: "supplier_inactive" }
  | LineRefusal
  | { kind: "recorded"; purchase: RecordedPurchase; saleUnits: ReadonlyMap<string, SaleUnit> };

export async function recordPurchase(
  tx: PurchaseRecordingTransaction,
  input: PurchaseToRecord,
  recordedAt: Date,
): Promise<PurchaseRecordingOutcome> {
  const supplier = await tx.lockSupplier(input.supplierId);
  if (supplier.kind === "not_found") {
    return { kind: "supplier_not_found" };
  }
  if (!mayBePurchasedFrom(supplier.supplier)) {
    return { kind: "supplier_inactive" };
  }

  const held = await holdAndResolveLines(tx, input.lines);
  if (held.kind !== "resolved") {
    return held;
  }
  const resolved = held.lines;

  const { id: purchaseId } = await tx.insertPurchase({
    supplierId: input.supplierId,
    locationId: input.locationId,
    purchasedOn: input.purchasedOn,
    receiptType: input.receiptType,
    receiptNumber: input.receiptNumber,
    note: input.note,
    recordedAt,
    actorId: input.actorId,
  });

  const lines = await recordPurchaseLines(tx, {
    purchaseId,
    locationId: input.locationId,
    actorId: input.actorId,
    recordedAt,
    purchasedOn: input.purchasedOn,
    firstPosition: 1,
    resolved,
  });

  return {
    kind: "recorded",
    purchase: {
      id: purchaseId,
      supplierId: input.supplierId,
      locationId: input.locationId,
      purchasedOn: input.purchasedOn,
      receiptType: input.receiptType,
      receiptNumber: input.receiptNumber,
      note: input.note,
      recordedAt,
      lines,
    },
    saleUnits: new Map(resolved.map(({ line, saleUnit }) => [line.productId, saleUnit])),
  };
}
