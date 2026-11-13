import { cashMovementDirection } from "./cash-movement-direction.js";
import type { CashMovementKind } from "./cash-movement-kind.js";
import type { CashMovement } from "./cash-session.js";
import { expectedCash } from "./expected-cash.js";

type CashAfterMovement =
  | { kind: "remaining"; cash: number }
  | { kind: "exceeds_expected_cash"; expected: number };

export function cashAfterMovement(
  sessionMovements: readonly Pick<CashMovement, "type" | "amount">[],
  movement: { kind: CashMovementKind; amount: number },
): CashAfterMovement {
  const expected = expectedCash(sessionMovements);
  if (cashMovementDirection(movement.kind) === "in") {
    return { kind: "remaining", cash: expected + movement.amount };
  }
  if (movement.amount > expected) {
    return { kind: "exceeds_expected_cash", expected };
  }
  return { kind: "remaining", cash: expected - movement.amount };
}
