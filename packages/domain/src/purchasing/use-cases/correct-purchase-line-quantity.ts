import type { Clock } from "../../shared/index.js";
import { mayBeMovementQuantity } from "../../stock/index.js";
import { isPackageCount, packagedQuantity } from "../model/purchase-line.js";
import type { PurchaseCorrectionStore } from "./purchase-correction-store.js";

export type PurchaseLineCount =
  | { loadedBy: "quantity"; quantity: number }
  | { loadedBy: "packages"; packages: number };

export interface CorrectPurchaseLineQuantityInput {
  purchaseId: string;
  lineId: string;
  locationId: string;
  actorId: string;
  count: PurchaseLineCount;
}

export interface CorrectPurchaseLineQuantityPorts {
  store: PurchaseCorrectionStore;
  clock: Clock;
}

export type CorrectPurchaseLineQuantityOutcome =
  | { kind: "purchase_not_found" }
  | { kind: "line_not_found" }
  | { kind: "invalid_quantity" }
  | { kind: "not_enough_in_lot" }
  | { kind: "unchanged" }
  | { kind: "corrected"; lineId: string; quantity: number; packages: number | null };

export async function correctPurchaseLineQuantity(
  { store, clock }: CorrectPurchaseLineQuantityPorts,
  input: CorrectPurchaseLineQuantityInput,
): Promise<CorrectPurchaseLineQuantityOutcome> {
  const { count } = input;
  if (
    count.loadedBy === "quantity"
      ? !mayBeMovementQuantity(count.quantity)
      : !isPackageCount(count.packages)
  ) {
    return { kind: "invalid_quantity" };
  }
  const correctedAt = clock.now();

  return store.transaction<CorrectPurchaseLineQuantityOutcome>(async (tx) => {
    const locked = await tx.lockPurchase(input.locationId, input.purchaseId);
    if (locked.kind === "not_found") {
      return { kind: "purchase_not_found" };
    }
    const line = await tx.purchaseLine(input.purchaseId, input.lineId);
    if (!line) {
      return { kind: "line_not_found" };
    }
    if ((line.packages === null) !== (count.loadedBy === "quantity")) {
      return { kind: "invalid_quantity" };
    }
    const next =
      count.loadedBy === "quantity"
        ? { quantity: count.quantity, packages: null }
        : {
            quantity: packagedQuantity(count.packages, line.quantityPerPackage),
            packages: count.packages,
          };
    if (!mayBeMovementQuantity(next.quantity)) {
      return { kind: "invalid_quantity" };
    }
    if (next.quantity === line.quantity) {
      return { kind: "unchanged" };
    }

    const corrected = await tx.correctLotQuantity({
      locationId: input.locationId,
      purchaseLineId: line.id,
      delta: next.quantity - line.quantity,
      actorId: input.actorId,
    });
    if (corrected.kind !== "corrected") {
      return corrected;
    }
    await tx.updatePurchaseLineQuantity(line.id, next.quantity, next.packages);
    await tx.recordPurchaseCorrection({
      purchaseId: input.purchaseId,
      actorId: input.actorId,
      correctedAt,
      change: {
        kind: "line_quantity",
        lineId: line.id,
        previous: { quantity: line.quantity, packages: line.packages },
        next,
      },
    });
    return { kind: "corrected", lineId: line.id, ...next };
  });
}
