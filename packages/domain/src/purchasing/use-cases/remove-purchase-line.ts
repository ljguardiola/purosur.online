import type { Clock } from "../../shared/index.js";
import type { PurchaseCorrectionStore } from "./purchase-correction-store.js";

export interface RemovePurchaseLineInput {
  purchaseId: string;
  lineId: string;
  locationId: string;
  actorId: string;
}

export interface RemovePurchaseLinePorts {
  store: PurchaseCorrectionStore;
  clock: Clock;
}

export type RemovePurchaseLineOutcome =
  | { kind: "purchase_not_found" }
  | { kind: "line_not_found" }
  | { kind: "last_line" }
  | { kind: "units_left_lot" }
  | { kind: "counted_since_receipt" }
  | { kind: "removed"; lineId: string };

export async function removePurchaseLine(
  { store, clock }: RemovePurchaseLinePorts,
  input: RemovePurchaseLineInput,
): Promise<RemovePurchaseLineOutcome> {
  const correctedAt = clock.now();

  return store.transaction<RemovePurchaseLineOutcome>(async (tx) => {
    const locked = await tx.lockPurchase(input.locationId, input.purchaseId);
    if (locked.kind === "not_found") {
      return { kind: "purchase_not_found" };
    }
    const line = await tx.purchaseLine(input.purchaseId, input.lineId);
    if (!line) {
      return { kind: "line_not_found" };
    }
    const lineIds = await tx.purchaseLineIds(input.purchaseId);
    if (lineIds.every((lineId) => lineId === line.id)) {
      return { kind: "last_line" };
    }

    await tx.holdPurchasedProduct(line.productId);
    const withdrawn = await tx.withdrawLineLots({
      locationId: input.locationId,
      purchaseLineId: line.id,
      actorId: input.actorId,
    });
    if (withdrawn.kind !== "withdrawn") {
      return withdrawn;
    }
    await tx.markPurchaseLineRemoved(line.id, correctedAt);
    await tx.recordPurchaseCorrection({
      purchaseId: input.purchaseId,
      actorId: input.actorId,
      correctedAt,
      change: {
        kind: "line_removed",
        lineId: line.id,
        productId: line.productId,
        quantity: line.quantity,
        packages: line.packages,
        costPaidCents: line.costPaidCents,
        expiresOn: line.expiresOn,
      },
    });
    return { kind: "removed", lineId: line.id };
  });
}
