import type { Clock } from "../../shared/index.js";
import type { PurchaseCorrectionStore } from "./purchase-correction-store.js";
import { holdAndResolveLines, type RegisterPurchaseLine } from "./purchase-line-resolution.js";

export interface ChangePurchaseLineProductInput {
  purchaseId: string;
  lineId: string;
  locationId: string;
  actorId: string;
  productId: string;
}

export interface ChangePurchaseLineProductPorts {
  store: PurchaseCorrectionStore;
  clock: Clock;
}

export type ChangePurchaseLineProductOutcome =
  | { kind: "purchase_not_found" }
  | { kind: "line_not_found" }
  | { kind: "unchanged" }
  | { kind: "product_not_found" }
  | { kind: "product_inactive" }
  | { kind: "invalid_quantity" }
  | { kind: "units_left_lot" }
  | { kind: "counted_since_receipt" }
  | { kind: "changed"; lineId: string; productId: string };

export async function changePurchaseLineProduct(
  { store, clock }: ChangePurchaseLineProductPorts,
  input: ChangePurchaseLineProductInput,
): Promise<ChangePurchaseLineProductOutcome> {
  const correctedAt = clock.now();

  return store.transaction<ChangePurchaseLineProductOutcome>(async (tx) => {
    const locked = await tx.lockPurchase(input.locationId, input.purchaseId);
    if (locked.kind === "not_found") {
      return { kind: "purchase_not_found" };
    }
    const line = await tx.purchaseLine(input.purchaseId, input.lineId);
    if (!line) {
      return { kind: "line_not_found" };
    }
    if (line.productId === input.productId) {
      return { kind: "unchanged" };
    }

    const base = {
      productId: input.productId,
      costPaidCents: line.costPaidCents,
      expiresOn: line.expiresOn,
    };
    const registered: RegisterPurchaseLine =
      line.packages === null
        ? { ...base, loadedBy: "quantity", quantity: line.quantity }
        : {
            ...base,
            loadedBy: "packages",
            packages: line.packages,
            quantityPerPackage: line.quantityPerPackage,
          };
    const resolved = await holdAndResolveLines(tx, [registered], [line.productId]);
    if (resolved.kind !== "resolved") {
      return { kind: resolved.kind };
    }

    const moved = await tx.moveLineLots({
      locationId: input.locationId,
      purchaseLineId: line.id,
      productId: input.productId,
      actorId: input.actorId,
    });
    if (moved.kind !== "moved") {
      return moved;
    }
    await tx.updatePurchaseLineProduct(line.id, input.productId);
    await tx.postponePriceReviews({
      locationId: input.locationId,
      purchaseId: input.purchaseId,
      actorId: input.actorId,
      postponedAt: correctedAt,
      productIds: [input.productId],
    });
    await tx.recordPurchaseCorrection({
      purchaseId: input.purchaseId,
      actorId: input.actorId,
      correctedAt,
      change: {
        kind: "line_product",
        lineId: line.id,
        previous: line.productId,
        next: input.productId,
      },
    });
    return { kind: "changed", lineId: line.id, productId: input.productId };
  });
}
