import type { PlannedLotAllocation } from "../model/lot-allocation.js";
import {
  countByLotAllocations,
  countByProductAllocations,
  isCountableByLot,
  lotsAtMoment,
} from "../model/lot-count.js";
import { countResult } from "../model/stock-count.js";
import { isCountedQuantity } from "../model/stock-quantity.js";
import {
  type AppliedStockMovement,
  allocateToLots,
  applyStockMovement,
} from "./apply-stock-movement.js";
import type { CountedLot, StockPorts } from "./stock-store.js";

export interface RegisterCountInput {
  productId: string;
  locationId: string;
  counted?: number;
  lots?: readonly CountedLot[];
  occurredAt: Date;
  actorId: string;
}

export type RegisterCountOutcome =
  | { kind: "occurred_in_the_future" }
  | { kind: "ambiguous_count" }
  | { kind: "not_found" }
  | { kind: "invalid_quantity" }
  | { kind: "repeated_lot" }
  | { kind: "invalid_lot" }
  | { kind: "count_at_same_moment" }
  | ({ kind: "recorded"; expected: number; delta: number } & AppliedStockMovement);

export async function registerCount(
  { store, clock }: StockPorts,
  input: RegisterCountInput,
): Promise<RegisterCountOutcome> {
  if (input.occurredAt.getTime() > clock.now().getTime()) {
    return { kind: "occurred_in_the_future" };
  }
  const countedLots = input.lots ?? [];
  const byLot = countedLots.length > 0;
  if (byLot === (input.counted !== undefined)) {
    return { kind: "ambiguous_count" };
  }
  const key = { productId: input.productId, locationId: input.locationId };
  return store.transaction<RegisterCountOutcome>(async (tx) => {
    const locked = await tx.lockProductStock(key);
    if (locked.kind === "not_found") {
      return { kind: "not_found" };
    }
    const quantities = byLot ? countedLots.map((lot) => lot.counted) : [input.counted ?? 0];
    if (!quantities.every((quantity) => isCountedQuantity(locked.saleUnit, quantity))) {
      return { kind: "invalid_quantity" };
    }
    const lotIds = new Set(countedLots.map((lot) => lot.lotId));
    if (lotIds.size < countedLots.length) {
      return { kind: "repeated_lot" };
    }

    // Two counts at one moment would each claim to be what the shelf held then, and which one
    // wins would depend on the order they arrived in.
    const coveringCount = await tx.earliestCountAtOrAfter(key, input.occurredAt);
    if (coveringCount?.occurredAt.getTime() === input.occurredAt.getTime()) {
      return { kind: "count_at_same_moment" };
    }

    const appliedAfterCount = await tx.appliedDeltaAfter(key, input.occurredAt);
    const allocatedAfter = await tx.lotAllocationsAfter(key, input.occurredAt);
    const lots = lotsAtMoment(await tx.productLots(key), allocatedAfter);
    const countable = new Set(lots.filter(isCountableByLot).map((lot) => lot.id));
    if (![...lotIds].every((lotId) => countable.has(lotId))) {
      return { kind: "invalid_lot" };
    }

    const counted = byLot
      ? countedLots.reduce((sum, lot) => sum + lot.counted, 0)
      : (input.counted ?? 0);
    const { expected, delta } = countResult({
      counted,
      balance: locked.balance,
      appliedAfterCount,
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
    await tx.recordCount({ movementId: applied.movementId, counted, expected });
    if (byLot) {
      await tx.recordCountedLots(applied.movementId, countedLots);
    }
    if (applied.supersededByCountId === null) {
      const planned: PlannedLotAllocation[] = byLot
        ? countByLotAllocations(lots, new Map(countedLots.map((lot) => [lot.lotId, lot.counted])))
        : countByProductAllocations(lots, counted);
      await allocateToLots(tx, key, applied.movementId, planned);
    }
    return { kind: "recorded", expected, delta, ...applied };
  });
}
