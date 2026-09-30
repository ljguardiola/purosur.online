import {
  type AdjustmentReason,
  adjustmentDirections,
  type StockDirection,
  signedDelta,
} from "../model/stock-movement-reason.js";
import { isMovementQuantity } from "../model/stock-quantity.js";
import { type AppliedStockMovement, applyStockMovement } from "./apply-stock-movement.js";
import type { StockPorts } from "./stock-store.js";

export interface RecordAdjustmentInput {
  productId: string;
  locationId: string;
  reason: AdjustmentReason;
  direction: StockDirection;
  quantity: number;
  actorId: string;
}

export type RecordAdjustmentOutcome =
  | { kind: "not_found" }
  | { kind: "direction_not_allowed" }
  | { kind: "invalid_quantity" }
  | ({ kind: "recorded" } & AppliedStockMovement);

export async function recordAdjustment(
  { store, clock }: StockPorts,
  input: RecordAdjustmentInput,
): Promise<RecordAdjustmentOutcome> {
  if (!adjustmentDirections(input.reason).includes(input.direction)) {
    return { kind: "direction_not_allowed" };
  }
  const key = { productId: input.productId, locationId: input.locationId };
  const occurredAt = clock.now();
  return store.transaction<RecordAdjustmentOutcome>(async (tx) => {
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
      kind: "adjustment",
      reason: input.reason,
      delta: signedDelta(input.direction, input.quantity),
      occurredAt,
      actorId: input.actorId,
      supersededByCountId: coveringCount?.movementId ?? null,
    });
    return { kind: "recorded", ...applied };
  });
}
