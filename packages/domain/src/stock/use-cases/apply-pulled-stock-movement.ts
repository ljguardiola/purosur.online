import type { PulledStockMovement, ReplicatedStockLedger } from "./replicated-stock-ledger.js";

export type ApplyPulledStockMovementOutcome =
  | { kind: "applied" }
  | { kind: "recorded_superseded" }
  | { kind: "undone" }
  | { kind: "unchanged" };

// A movement the ledger already holds either moved the balance when it was recorded or was recorded
// already superseded, so the only change it can still bring is a count the cloud superseded it by.
export function applyPulledStockMovement(
  ledger: ReplicatedStockLedger,
  movement: PulledStockMovement,
): ApplyPulledStockMovementOutcome {
  const recorded = ledger.movement(movement.id);
  if (recorded === undefined) {
    ledger.recordMovement(movement);
    if (movement.supersededByCountId !== null) {
      return { kind: "recorded_superseded" };
    }
    ledger.addToBalance(movement.productId, movement.delta);
    return { kind: "applied" };
  }
  if (movement.supersededByCountId === null || recorded.supersededByCountId !== null) {
    return { kind: "unchanged" };
  }
  ledger.markSuperseded(movement.id, movement.supersededByCountId);
  ledger.addToBalance(movement.productId, -movement.delta);
  return { kind: "undone" };
}
