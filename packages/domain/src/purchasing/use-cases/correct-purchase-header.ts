import type { Clock, ZoneRulesSource } from "../../shared/index.js";
import { isPurchaseDateInFuture } from "../model/purchase.js";
import type {
  PurchaseCorrectionStore,
  PurchaseHeaderChange,
  PurchaseHeaderValues,
} from "./purchase-correction-store.js";

export interface CorrectPurchaseHeaderInput extends PurchaseHeaderValues {
  purchaseId: string;
  locationId: string;
  actorId: string;
}

export interface CorrectPurchaseHeaderPorts {
  store: PurchaseCorrectionStore;
  clock: Clock;
  zoneRules: ZoneRulesSource;
}

export type CorrectPurchaseHeaderOutcome =
  | { kind: "date_in_future" }
  | { kind: "purchase_not_found" }
  | { kind: "unchanged" }
  | { kind: "corrected"; purchase: PurchaseHeaderValues & { id: string } };

function changesOf(previous: PurchaseHeaderValues, next: PurchaseHeaderValues) {
  const changes: PurchaseHeaderChange[] = [];
  if (previous.purchasedOn !== next.purchasedOn) {
    changes.push({ field: "purchasedOn", previous: previous.purchasedOn, next: next.purchasedOn });
  }
  if (previous.receiptType !== next.receiptType) {
    changes.push({
      field: "receiptType",
      previous: previous.receiptType,
      next: next.receiptType,
    });
  }
  if (previous.receiptNumber !== next.receiptNumber) {
    changes.push({
      field: "receiptNumber",
      previous: previous.receiptNumber,
      next: next.receiptNumber,
    });
  }
  if (previous.note !== next.note) {
    changes.push({ field: "note", previous: previous.note, next: next.note });
  }
  return changes;
}

export async function correctPurchaseHeader(
  { store, clock, zoneRules }: CorrectPurchaseHeaderPorts,
  input: CorrectPurchaseHeaderInput,
): Promise<CorrectPurchaseHeaderOutcome> {
  const correctedAt = clock.now();
  if (isPurchaseDateInFuture(input.purchasedOn, correctedAt, zoneRules.zoneRules())) {
    return { kind: "date_in_future" };
  }
  const next: PurchaseHeaderValues = {
    purchasedOn: input.purchasedOn,
    receiptType: input.receiptType,
    receiptNumber: input.receiptNumber,
    note: input.note,
  };

  return store.transaction<CorrectPurchaseHeaderOutcome>(async (tx) => {
    const locked = await tx.lockPurchase(input.locationId, input.purchaseId);
    if (locked.kind === "not_found") {
      return { kind: "purchase_not_found" };
    }
    const { id, purchasedOn, receiptType, receiptNumber, note } = locked.purchase;
    const changes = changesOf({ purchasedOn, receiptType, receiptNumber, note }, next);
    if (changes.length === 0) {
      return { kind: "unchanged" };
    }

    await tx.updatePurchaseHeader(id, next);
    if (purchasedOn !== next.purchasedOn) {
      await tx.redatePurchasedLots({
        locationId: input.locationId,
        purchaseLineIds: await tx.purchaseLineIds(id),
        purchasedOn: next.purchasedOn,
      });
    }
    await tx.recordPurchaseCorrection({
      purchaseId: id,
      actorId: input.actorId,
      correctedAt,
      change: { kind: "header", changes },
    });
    return { kind: "corrected", purchase: { id, ...next } };
  });
}
