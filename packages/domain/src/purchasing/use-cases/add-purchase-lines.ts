import type { Clock } from "../../shared/index.js";
import { hasPurchaseLines } from "../model/purchase.js";
import type { PurchaseCorrectionStore } from "./purchase-correction-store.js";
import {
  holdAndResolveLines,
  type LineRefusal,
  type RegisteredPurchaseLine,
  type RegisterPurchaseLine,
  recordPurchaseLines,
} from "./purchase-line-resolution.js";

export interface AddPurchaseLinesInput {
  purchaseId: string;
  locationId: string;
  actorId: string;
  lines: readonly RegisterPurchaseLine[];
}

export interface AddPurchaseLinesPorts {
  store: PurchaseCorrectionStore;
  clock: Clock;
}

export type AddPurchaseLinesOutcome =
  | { kind: "no_lines" }
  | { kind: "purchase_not_found" }
  | LineRefusal
  | { kind: "added"; purchaseId: string; lines: RegisteredPurchaseLine[] };

export async function addPurchaseLines(
  { store, clock }: AddPurchaseLinesPorts,
  input: AddPurchaseLinesInput,
): Promise<AddPurchaseLinesOutcome> {
  if (!hasPurchaseLines(input.lines.length)) {
    return { kind: "no_lines" };
  }
  const recordedAt = clock.now();

  return store.transaction<AddPurchaseLinesOutcome>(async (tx) => {
    const locked = await tx.lockPurchase(input.locationId, input.purchaseId);
    if (locked.kind === "not_found") {
      return { kind: "purchase_not_found" };
    }
    const { purchase } = locked;

    const held = await holdAndResolveLines(tx, input.lines);
    if (held.kind !== "resolved") {
      return held;
    }

    const lines = await recordPurchaseLines(tx, {
      purchaseId: purchase.id,
      locationId: input.locationId,
      actorId: input.actorId,
      recordedAt,
      purchasedOn: purchase.purchasedOn,
      firstPosition: purchase.lastLinePosition + 1,
      resolved: held.lines,
    });

    await tx.recordPurchaseCorrection({
      purchaseId: purchase.id,
      actorId: input.actorId,
      correctedAt: recordedAt,
      change: {
        kind: "lines_added",
        lines: lines.map(({ id, productId, quantity, costPaidCents, expiresOn }) => ({
          lineId: id,
          productId,
          quantity,
          costPaidCents,
          expiresOn,
        })),
      },
    });

    return { kind: "added", purchaseId: purchase.id, lines };
  });
}
