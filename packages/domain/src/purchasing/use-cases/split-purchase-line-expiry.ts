import type { Clock } from "../../shared/index.js";
import type { PurchaseCorrectionStore } from "./purchase-correction-store.js";

export interface SplitPurchaseLineExpiryInput {
  purchaseId: string;
  lineId: string;
  locationId: string;
  actorId: string;
  quantity: number;
  expiresOn: string | null;
}

export interface SplitPurchaseLineExpiryPorts {
  store: PurchaseCorrectionStore;
  clock: Clock;
}

export type SplitPurchaseLineExpiryOutcome =
  | { kind: "purchase_not_found" }
  | { kind: "line_not_found" }
  | { kind: "unchanged" }
  | { kind: "invalid_quantity" }
  | { kind: "not_enough_in_lot" }
  | { kind: "split"; lineId: string; lotId: string };

export async function splitPurchaseLineExpiry(
  { store, clock }: SplitPurchaseLineExpiryPorts,
  input: SplitPurchaseLineExpiryInput,
): Promise<SplitPurchaseLineExpiryOutcome> {
  const correctedAt = clock.now();

  return store.transaction<SplitPurchaseLineExpiryOutcome>(async (tx) => {
    const locked = await tx.lockPurchase(input.locationId, input.purchaseId);
    if (locked.kind === "not_found") {
      return { kind: "purchase_not_found" };
    }
    const line = await tx.purchaseLine(input.purchaseId, input.lineId);
    if (!line) {
      return { kind: "line_not_found" };
    }
    if (line.expiresOn === input.expiresOn) {
      return { kind: "unchanged" };
    }

    const split = await tx.splitLotExpiry({
      locationId: input.locationId,
      purchaseLineId: line.id,
      quantity: input.quantity,
      expiresOn: input.expiresOn,
      occurredAt: correctedAt,
      actorId: input.actorId,
    });
    if (split.kind !== "split") {
      return split;
    }
    await tx.recordPurchaseCorrection({
      purchaseId: input.purchaseId,
      actorId: input.actorId,
      correctedAt,
      change: {
        kind: "line_expiry_split",
        lineId: line.id,
        quantity: input.quantity,
        previous: line.expiresOn,
        next: input.expiresOn,
      },
    });
    return { kind: "split", lineId: line.id, lotId: split.lotId };
  });
}
