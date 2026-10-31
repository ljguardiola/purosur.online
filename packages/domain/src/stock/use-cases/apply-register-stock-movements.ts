import {
  lotTarget,
  type PlannedLotAllocation,
  restockedReturnAllocations,
  voidedMovementAllocations,
} from "../model/lot-allocation.js";
import { isMovementQuantity } from "../model/stock-quantity.js";
import { type AppliedLotAllocation, recordStockMovement } from "./apply-stock-movement.js";
import type { ProductStockKey, StockStoreTransaction } from "./stock-store.js";

export type RegisterStockMovement = {
  id: string;
  productId: string;
  delta: number;
} & (
  | { kind: "sale" | "sale_void" | "return"; saleLineId: string }
  | { kind: "loss"; reason: "return_discard"; saleLineId: string }
);

export interface ApplyRegisterStockMovementsInput {
  locationId: string;
  occurredAt: Date;
  actorId: string;
  movements: readonly RegisterStockMovement[];
}

export type ApplyRegisterStockMovementsOutcome =
  | { kind: "not_found"; productId: string }
  | { kind: "invalid_quantity"; productId: string }
  | { kind: "applied" };

export async function applyRegisterStockMovements(
  tx: StockStoreTransaction,
  input: ApplyRegisterStockMovementsInput,
): Promise<ApplyRegisterStockMovementsOutcome> {
  const productIds = [...new Set(input.movements.map((movement) => movement.productId))].sort();
  for (const productId of productIds) {
    const locked = await tx.lockProductStock({ productId, locationId: input.locationId });
    if (locked.kind === "not_found") {
      return { kind: "not_found", productId };
    }
    const refused = input.movements.find(
      (movement) =>
        movement.productId === productId &&
        !isMovementQuantity(
          locked.saleUnit,
          movement.kind === "sale" || movement.kind === "loss" ? -movement.delta : movement.delta,
        ),
    );
    if (refused) {
      return { kind: "invalid_quantity", productId };
    }
  }

  const appliedReturns = new Map<string, AppliedLotAllocation[]>();
  for (const movement of input.movements) {
    const key = { productId: movement.productId, locationId: input.locationId };
    const coveringCount = await tx.earliestCountAtOrAfter(key, input.occurredAt);
    const planned = await plannedAllocations(tx, key, movement, appliedReturns);
    const { allocations } = await recordStockMovement(
      tx,
      {
        ...key,
        id: movement.id,
        kind: movement.kind,
        reason: movement.kind === "loss" ? movement.reason : null,
        saleLineId: movement.saleLineId,
        delta: movement.delta,
        occurredAt: input.occurredAt,
        actorId: input.actorId,
        supersededByCountId: coveringCount?.movementId ?? null,
      },
      planned,
    );
    if (movement.kind === "return") {
      appliedReturns.set(discardPairKey(movement), allocations);
    }
  }
  return { kind: "applied" };
}

function discardPairKey(movement: { productId: string; saleLineId: string }): string {
  return `${movement.productId}:${movement.saleLineId}`;
}

async function plannedAllocations(
  tx: StockStoreTransaction,
  key: ProductStockKey,
  movement: RegisterStockMovement,
  appliedReturns: ReadonlyMap<string, readonly AppliedLotAllocation[]>,
): Promise<PlannedLotAllocation[] | undefined> {
  switch (movement.kind) {
    case "sale_void":
      return voidedMovementAllocations(
        await tx.productLots(key),
        await tx.saleLineLotAllocations(key, movement.saleLineId),
        movement.delta,
      );
    case "return":
      return restockedReturnAllocations(
        await tx.productLots(key),
        await tx.saleLineLotAllocations(key, movement.saleLineId),
        await tx.saleLineReturnedLotAllocations(key, movement.saleLineId),
        movement.delta,
      );
    case "loss":
      return appliedReturns
        .get(discardPairKey(movement))
        ?.map(({ lotId, quantity }) => ({ target: lotTarget(lotId), quantity: -quantity }));
    case "sale":
      return undefined;
  }
}
