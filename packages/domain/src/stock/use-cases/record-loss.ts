import { type LossReason, lossDelta } from "../model/stock-movement-reason.js";
import { isMovementQuantity } from "../model/stock-quantity.js";
import { type AppliedStockMovement, applyStockMovement } from "./apply-stock-movement.js";
import type { StockPorts } from "./stock-store.js";

export interface RecordLossInput {
  productId: string;
  locationId: string;
  reason: LossReason;
  quantity: number;
  actorId: string;
}

export type RecordLossOutcome =
  | { kind: "not_found" }
  | { kind: "invalid_quantity" }
  | ({ kind: "recorded" } & AppliedStockMovement);

export async function recordLoss(
  { store, clock }: StockPorts,
  input: RecordLossInput,
): Promise<RecordLossOutcome> {
  const key = { productId: input.productId, locationId: input.locationId };
  const occurredAt = clock.now();
  return store.transaction<RecordLossOutcome>(async (tx) => {
    const locked = await tx.lockProductStock(key);
    if (locked.kind === "not_found") {
      return { kind: "not_found" };
    }
    if (!isMovementQuantity(locked.saleUnit, input.quantity)) {
      return { kind: "invalid_quantity" };
    }

    const coveringCount = await tx.earliestCountAtOrAfter(key, occurredAt);
    const applied = await applyStockMovement(tx, locked.balance, {
      ...key,
      kind: "loss",
      reason: input.reason,
      delta: lossDelta(input.quantity),
      occurredAt,
      actorId: input.actorId,
      supersededByCountId: coveringCount?.movementId ?? null,
    });
    return { kind: "recorded", ...applied };
  });
}
