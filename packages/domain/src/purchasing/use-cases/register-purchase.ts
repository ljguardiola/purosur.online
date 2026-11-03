import type { Clock, ZoneRulesSource } from "../../shared/index.js";
import {
  hasPurchaseLines,
  isPurchaseDateInFuture,
  mayBePurchasedFrom,
  type ReceiptType,
} from "../model/purchase.js";
import {
  holdAndResolveLines,
  type LineRefusal,
  type RegisteredPurchaseLine,
  type RegisterPurchaseLine,
  recordPurchaseLines,
} from "./purchase-line-resolution.js";
import type { PurchasingStore } from "./purchasing-store.js";

export type { RegisteredPurchaseLine, RegisterPurchaseLine };

export interface RegisterPurchaseInput {
  supplierId: string;
  purchasedOn: string;
  receiptType: ReceiptType;
  receiptNumber: string | null;
  note: string | null;
  lines: readonly RegisterPurchaseLine[];
  actorId: string;
  locationId: string;
}

export interface RegisterPurchasePorts {
  store: PurchasingStore;
  clock: Clock;
  zoneRules: ZoneRulesSource;
}

export interface RegisteredPurchase {
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

export type RegisterPurchaseOutcome =
  | { kind: "no_lines" }
  | { kind: "date_in_future" }
  | { kind: "supplier_not_found" }
  | { kind: "supplier_inactive" }
  | LineRefusal
  | { kind: "registered"; purchase: RegisteredPurchase };

export async function registerPurchase(
  { store, clock, zoneRules }: RegisterPurchasePorts,
  input: RegisterPurchaseInput,
): Promise<RegisterPurchaseOutcome> {
  if (!hasPurchaseLines(input.lines.length)) {
    return { kind: "no_lines" };
  }
  const recordedAt = clock.now();
  if (isPurchaseDateInFuture(input.purchasedOn, recordedAt, zoneRules.zoneRules())) {
    return { kind: "date_in_future" };
  }

  return store.transaction<RegisterPurchaseOutcome>(async (tx) => {
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
      kind: "registered",
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
    };
  });
}
