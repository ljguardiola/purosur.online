import type { Clock } from "../../shared/index.js";
import type { PurchaseCorrectionStore } from "./purchase-correction-store.js";

export interface CorrectPurchaseLineExpiryInput {
  purchaseId: string;
  lineId: string;
  locationId: string;
  actorId: string;
  expiresOn: string | null;
}

export interface CorrectPurchaseLineExpiryPorts {
  store: PurchaseCorrectionStore;
  clock: Clock;
}

export type CorrectPurchaseLineExpiryOutcome =
  | { kind: "purchase_not_found" }
  | { kind: "line_not_found" }
  | { kind: "unchanged" }
  | { kind: "corrected"; lineId: string; expiresOn: string | null };

export async function correctPurchaseLineExpiry(
  { store, clock }: CorrectPurchaseLineExpiryPorts,
  input: CorrectPurchaseLineExpiryInput,
): Promise<CorrectPurchaseLineExpiryOutcome> {
  const correctedAt = clock.now();

  return store.transaction<CorrectPurchaseLineExpiryOutcome>(async (tx) => {
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

    await tx.updatePurchaseLineExpiry(line.id, input.expiresOn);
    await tx.correctLotExpiry({
      locationId: input.locationId,
      purchaseLineId: line.id,
      expiresOn: input.expiresOn,
    });
    await tx.recordPurchaseCorrection({
      purchaseId: input.purchaseId,
      actorId: input.actorId,
      correctedAt,
      change: {
        kind: "line_expiry",
        lineId: line.id,
        previous: line.expiresOn,
        next: input.expiresOn,
      },
    });
    return { kind: "corrected", lineId: line.id, expiresOn: input.expiresOn };
  });
}
