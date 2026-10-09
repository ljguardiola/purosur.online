import { isMovementQuantity } from "../model/stock-quantity.js";
import { type AppliedStockMovement, applyStockMovement } from "./apply-stock-movement.js";
import type { StockStoreTransaction } from "./stock-store.js";

export interface RegisterStockMovement {
  id: string;
  productId: string;
  kind: "sale";
  delta: number;
}

export interface ApplyRegisterStockMovementsInput {
  locationId: string;
  occurredAt: Date;
  actorId: string;
  movements: readonly RegisterStockMovement[];
}

export type ApplyRegisterStockMovementsOutcome =
  | { kind: "not_found"; productId: string }
  | { kind: "invalid_quantity"; productId: string }
  | { kind: "applied"; movements: AppliedStockMovement[] };

// Every product is locked in the order of its id, so two operations taking several products'
// stock never wait on each other in a cycle; nothing is written until every movement is valid.
export async function applyRegisterStockMovements(
  tx: StockStoreTransaction,
  input: ApplyRegisterStockMovementsInput,
): Promise<ApplyRegisterStockMovementsOutcome> {
  const productIds = [...new Set(input.movements.map((movement) => movement.productId))].sort();
  const lockedBalances = new Map<string, number>();
  for (const productId of productIds) {
    const locked = await tx.lockProductStock({ productId, locationId: input.locationId });
    if (locked.kind === "not_found") {
      return { kind: "not_found", productId };
    }
    const refused = input.movements.find(
      (movement) =>
        movement.productId === productId && !isMovementQuantity(locked.saleUnit, -movement.delta),
    );
    if (refused) {
      return { kind: "invalid_quantity", productId };
    }
    lockedBalances.set(productId, locked.balance);
  }

  const applied: AppliedStockMovement[] = [];
  for (const movement of input.movements) {
    const key = { productId: movement.productId, locationId: input.locationId };
    const coveringCount = await tx.earliestCountAtOrAfter(key, input.occurredAt);
    const result = await applyStockMovement(tx, lockedBalances.get(movement.productId) ?? 0, {
      ...key,
      id: movement.id,
      kind: movement.kind,
      reason: null,
      delta: movement.delta,
      occurredAt: input.occurredAt,
      actorId: input.actorId,
      supersededByCountId: coveringCount?.movementId ?? null,
    });
    lockedBalances.set(movement.productId, result.balance);
    applied.push(result);
  }
  return { kind: "applied", movements: applied };
}
