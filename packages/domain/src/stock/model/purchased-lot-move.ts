import type { StockMovementKind } from "./stock-movement-kind.js";

export interface AllocatedMovement {
  kind: StockMovementKind;
  purchaseLineId: string | null;
}

export function arePurchasedLotsUntouched(
  purchaseLineId: string,
  movements: readonly AllocatedMovement[],
): boolean {
  return movements.every(
    (movement) =>
      movement.kind === "lot_split" ||
      (movement.kind === "receipt" && movement.purchaseLineId === purchaseLineId),
  );
}
