import { lotTarget } from "../model/lot-allocation.js";
import { allocateToLots, recordStockMovement } from "./apply-stock-movement.js";
import type { StockStoreTransaction } from "./stock-store.js";

export interface WithdrawOpeningCountInput {
  locationId: string;
  occurredAt: Date;
  actorId: string;
  movementId: string;
  withdrawnMovementId: string;
}

export type WithdrawOpeningCountOutcome =
  | { kind: "not_found" }
  | { kind: "already_withdrawn" }
  | {
      kind: "withdrawn";
      taken: number;
      notTaken: number;
      supersededByCountId: string | null;
    };

export async function withdrawOpeningCount(
  tx: StockStoreTransaction,
  input: WithdrawOpeningCountInput,
): Promise<WithdrawOpeningCountOutcome> {
  const found = await tx.openingCountLot(input.locationId, input.withdrawnMovementId);
  if (found === undefined) {
    return { kind: "not_found" };
  }
  const key = { productId: found.productId, locationId: input.locationId };
  await tx.lockProductStock(key);
  const line = await tx.openingCountLot(input.locationId, input.withdrawnMovementId);
  if (line === undefined) {
    return { kind: "not_found" };
  }
  if (line.withdrawn) {
    return { kind: "already_withdrawn" };
  }

  const lot = (await tx.productLots(key)).find((candidate) => candidate.id === line.lotId);
  const taken = Math.min(line.counted, Math.max(lot?.remaining ?? 0, 0));
  const coveringCount = await tx.earliestCountAtOrAfter(key, input.occurredAt);
  const supersededByCountId = coveringCount?.movementId ?? null;
  if (taken > 0) {
    const { movementId, balance } = await recordStockMovement(tx, {
      ...key,
      id: input.movementId,
      kind: "opening_count_withdrawal",
      reason: null,
      delta: -taken,
      occurredAt: input.occurredAt,
      actorId: input.actorId,
      supersededByCountId,
    });
    if (balance !== null) {
      await allocateToLots(tx, key, movementId, [
        { target: lotTarget(line.lotId), quantity: -taken },
      ]);
    }
  }
  await tx.markOpeningCountWithdrawn(line.lotId);
  return { kind: "withdrawn", taken, notTaken: line.counted - taken, supersededByCountId };
}
