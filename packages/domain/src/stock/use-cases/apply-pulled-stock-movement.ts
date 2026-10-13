import type { PulledStockMovement, ReplicatedStockLedger } from "./replicated-stock-ledger.js";

export type ApplyPulledStockMovementOutcome =
  | { kind: "applied" }
  | { kind: "recorded_superseded" }
  | { kind: "corrected" }
  | { kind: "undone" }
  | { kind: "unchanged" };

// A movement the ledger already holds either moved the balance when it was recorded or was recorded
// already superseded, so it can still bring a count the cloud superseded it by, or the delta the
// cloud applied when that is not the one the register recorded.
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
  if (recorded.supersededByCountId !== null) {
    return { kind: "unchanged" };
  }
  if (movement.supersededByCountId === null) {
    if (movement.delta === recorded.delta) {
      return { kind: "unchanged" };
    }
    ledger.adoptMovementDelta(movement.id, movement.delta);
    ledger.addToBalance(movement.productId, movement.delta - recorded.delta);
    return { kind: "corrected" };
  }
  ledger.adoptMovementDelta(movement.id, movement.delta);
  ledger.markSuperseded(movement.id, movement.supersededByCountId);
  ledger.addToBalance(movement.productId, -recorded.delta);
  return { kind: "undone" };
}
