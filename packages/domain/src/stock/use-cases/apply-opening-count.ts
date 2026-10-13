import { lotOfOpeningCount } from "../model/lot.js";
import { receiptAllocations } from "../model/lot-allocation.js";
import { isMovementQuantity } from "../model/stock-quantity.js";
import { allocateToLots, recordStockMovement } from "./apply-stock-movement.js";
import type { StockStoreTransaction } from "./stock-store.js";

export interface ApplyOpeningCountInput {
  locationId: string;
  occurredAt: Date;
  actorId: string;
  movementId: string;
  productId: string;
  counted: number;
  expiresOn: string | null;
}

export type ApplyOpeningCountOutcome =
  | { kind: "not_found" }
  | { kind: "invalid_quantity" }
  | { kind: "already_applied" }
  | { kind: "recorded"; lotId: string };

export async function applyOpeningCount(
  tx: StockStoreTransaction,
  input: ApplyOpeningCountInput,
): Promise<ApplyOpeningCountOutcome> {
  const key = { productId: input.productId, locationId: input.locationId };
  const locked = await tx.lockProductStock(key);
  if (locked.kind === "not_found") {
    return { kind: "not_found" };
  }
  if ((await tx.openingCountLot(input.locationId, input.movementId)) !== undefined) {
    return { kind: "already_applied" };
  }
  if (!isMovementQuantity(locked.saleUnit, input.counted)) {
    return { kind: "invalid_quantity" };
  }

  const coveringCount = await tx.earliestCountAtOrAfter(key, input.occurredAt);
  const { movementId, balance } = await recordStockMovement(tx, {
    ...key,
    id: input.movementId,
    kind: "opening_count",
    reason: null,
    delta: input.counted,
    occurredAt: input.occurredAt,
    actorId: input.actorId,
    supersededByCountId: coveringCount?.movementId ?? null,
  });
  const lots = await tx.productLots(key);
  const lotId = await tx.recordInitialCountLot(
    lotOfOpeningCount({ ...input, movementId: input.movementId }),
  );
  if (balance !== null) {
    await allocateToLots(tx, key, movementId, receiptAllocations(lotId, lots, input.counted));
  }
  return { kind: "recorded", lotId };
}
