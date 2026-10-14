import { argentinaCalendarDay } from "../../shared/index.js";
import { lotTarget } from "../model/lot-allocation.js";
import { isExpired } from "../model/lot-expiry.js";
import { lossDelta } from "../model/stock-movement-reason.js";
import { type AppliedStockMovement, applyStockMovement } from "./apply-stock-movement.js";
import type { StockPorts } from "./stock-store.js";

export interface DiscardExpiredLotInput {
  lotId: string;
  locationId: string;
  actorId: string;
}

export type DiscardExpiredLotOutcome =
  | { kind: "not_found" }
  | { kind: "not_expired" }
  | { kind: "nothing_left" }
  | ({ kind: "discarded"; quantity: number } & AppliedStockMovement);

export async function discardExpiredLot(
  { store, clock }: StockPorts,
  input: DiscardExpiredLotInput,
): Promise<DiscardExpiredLotOutcome> {
  const occurredAt = clock.now();
  const today = argentinaCalendarDay(occurredAt);
  return store.transaction<DiscardExpiredLotOutcome>(async (tx) => {
    const productId = await tx.lotProduct(input.lotId, input.locationId);
    if (productId === undefined) {
      return { kind: "not_found" };
    }
    const key = { productId, locationId: input.locationId };
    const locked = await tx.lockProductStock(key);
    if (locked.kind === "not_found") {
      return { kind: "not_found" };
    }
    const lot = (await tx.productLots(key)).find((candidate) => candidate.id === input.lotId);
    if (!lot) {
      return { kind: "not_found" };
    }
    if (lot.expiresOn === null || !isExpired(lot.expiresOn, today)) {
      return { kind: "not_expired" };
    }
    if (lot.remaining <= 0) {
      return { kind: "nothing_left" };
    }

    const coveringCount = await tx.earliestCountAtOrAfter(key, occurredAt);
    const applied = await applyStockMovement(
      tx,
      locked.balance,
      {
        ...key,
        kind: "loss",
        reason: "expired",
        delta: lossDelta(lot.remaining),
        occurredAt,
        actorId: input.actorId,
        supersededByCountId: coveringCount?.movementId ?? null,
      },
      [{ target: lotTarget(lot.id), quantity: -lot.remaining }],
    );
    return { kind: "discarded", quantity: lot.remaining, ...applied };
  });
}
