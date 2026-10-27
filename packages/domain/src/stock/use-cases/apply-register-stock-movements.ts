import { saleVoidAllocations } from "../model/lot-allocation.js";
import { isMovementQuantity } from "../model/stock-quantity.js";
import { recordStockMovement } from "./apply-stock-movement.js";
import type { StockStoreTransaction } from "./stock-store.js";

export type RegisterStockMovement = {
  id: string;
  productId: string;
  delta: number;
} & (
  | { kind: "sale" | "sale_void" | "return"; saleLineId: string }
  | { kind: "loss"; reason: "return_discard" }
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

  for (const movement of input.movements) {
    const key = { productId: movement.productId, locationId: input.locationId };
    const coveringCount = await tx.earliestCountAtOrAfter(key, input.occurredAt);
    const returnedToLots =
      movement.kind === "sale_void"
        ? saleVoidAllocations(
            await tx.productLots(key),
            await tx.saleLineLotAllocations(key, movement.saleLineId),
            movement.delta,
          )
        : undefined;
    await recordStockMovement(
      tx,
      {
        ...key,
        id: movement.id,
        ...(movement.kind === "loss"
          ? { kind: movement.kind, reason: movement.reason }
          : { kind: movement.kind, reason: null, saleLineId: movement.saleLineId }),
        delta: movement.delta,
        occurredAt: input.occurredAt,
        actorId: input.actorId,
        supersededByCountId: coveringCount?.movementId ?? null,
      },
      returnedToLots,
    );
  }
  return { kind: "applied" };
}
