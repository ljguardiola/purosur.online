import type { Clock } from "../../shared/index.js";
import { isCostPaid } from "../model/purchase-line.js";
import type { PurchaseCorrectionStore } from "./purchase-correction-store.js";

export interface CorrectPurchaseLineCostInput {
  purchaseId: string;
  lineId: string;
  locationId: string;
  actorId: string;
  costPaidCents: number;
}

export interface CorrectPurchaseLineCostPorts {
  store: PurchaseCorrectionStore;
  clock: Clock;
}

export type CorrectPurchaseLineCostOutcome =
  | { kind: "invalid_cost" }
  | { kind: "purchase_not_found" }
  | { kind: "line_not_found" }
  | { kind: "unchanged" }
  | { kind: "corrected"; lineId: string; costPaidCents: number };

export async function correctPurchaseLineCost(
  { store, clock }: CorrectPurchaseLineCostPorts,
  input: CorrectPurchaseLineCostInput,
): Promise<CorrectPurchaseLineCostOutcome> {
  if (!isCostPaid(input.costPaidCents)) {
    return { kind: "invalid_cost" };
  }
  const correctedAt = clock.now();

  return store.transaction<CorrectPurchaseLineCostOutcome>(async (tx) => {
    const locked = await tx.lockPurchase(input.locationId, input.purchaseId);
    if (locked.kind === "not_found") {
      return { kind: "purchase_not_found" };
    }
    const line = await tx.purchaseLine(input.purchaseId, input.lineId);
    if (!line) {
      return { kind: "line_not_found" };
    }
    if (line.costPaidCents === input.costPaidCents) {
      return { kind: "unchanged" };
    }

    await tx.updatePurchaseLineCost(line.id, input.costPaidCents);
    await tx.correctLotCost({
      locationId: input.locationId,
      purchaseLineId: line.id,
      costPaidCents: input.costPaidCents,
      changedAt: correctedAt,
    });
    await tx.recordPurchaseCorrection({
      purchaseId: input.purchaseId,
      actorId: input.actorId,
      correctedAt,
      change: {
        kind: "line_cost",
        lineId: line.id,
        previous: line.costPaidCents,
        next: input.costPaidCents,
      },
    });
    return { kind: "corrected", lineId: line.id, costPaidCents: input.costPaidCents };
  });
}
