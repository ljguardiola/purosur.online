import { countResult } from "../model/stock-count.js";
import { isCountedQuantity } from "../model/stock-quantity.js";
import { type AppliedStockMovement, applyStockMovement } from "./apply-stock-movement.js";
import type { StockPorts } from "./stock-store.js";

export interface RegisterCountInput {
  productId: string;
  locationId: string;
  counted: number;
  occurredAt: Date;
  actorId: string;
}

export type RegisterCountOutcome =
  | { kind: "occurred_in_the_future" }
  | { kind: "not_found" }
  | { kind: "invalid_quantity" }
  | { kind: "count_at_same_moment" }
  | ({ kind: "recorded"; expected: number; delta: number } & AppliedStockMovement);

export async function registerCount(
  { store, clock }: StockPorts,
  input: RegisterCountInput,
): Promise<RegisterCountOutcome> {
  if (input.occurredAt.getTime() > clock.now().getTime()) {
    return { kind: "occurred_in_the_future" };
  }
  const key = { productId: input.productId, locationId: input.locationId };
  return store.transaction<RegisterCountOutcome>(async (tx) => {
    const locked = await tx.lockProductStock(key);
    if (locked.kind === "not_found") {
      return { kind: "not_found" };
    }
    if (!isCountedQuantity(locked.saleUnit, input.counted)) {
      return { kind: "invalid_quantity" };
    }

    // Two counts at one moment would each claim to be what the shelf held then, and which one
    // wins would depend on the order they arrived in.
    const coveringCount = await tx.earliestCountAtOrAfter(key, input.occurredAt);
    if (coveringCount?.occurredAt.getTime() === input.occurredAt.getTime()) {
      return { kind: "count_at_same_moment" };
    }

    const { expected, delta } = countResult({
      counted: input.counted,
      balance: locked.balance,
      appliedAfterCount: await tx.appliedDeltaAfter(key, input.occurredAt),
    });
    const applied = await applyStockMovement(tx, locked.balance, {
      ...key,
      kind: "count",
      reason: null,
      delta,
      occurredAt: input.occurredAt,
      actorId: input.actorId,
      supersededByCountId: coveringCount?.movementId ?? null,
    });
    await tx.recordCount({ movementId: applied.movementId, counted: input.counted, expected });
    return { kind: "recorded", expected, delta, ...applied };
  });
}
