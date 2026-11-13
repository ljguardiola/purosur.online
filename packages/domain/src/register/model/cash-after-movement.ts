import { cashMovementDirection } from "./cash-movement-direction.js";
import { type CashMovementKind, isValidCashMovementAmount } from "./cash-movement-kind.js";
import type { CashMovement } from "./cash-session.js";
import { expectedCash } from "./expected-cash.js";

type CashAfterMovement =
  | { kind: "remaining"; cash: number }
  | { kind: "exceeds_expected_cash"; expected: number }
  | { kind: "invalid_amount" };

export function cashAfterMovement(
  sessionMovements: readonly Pick<CashMovement, "type" | "amount">[],
  movement: { kind: CashMovementKind; amount: number },
): CashAfterMovement {
  if (!isValidCashMovementAmount(movement.amount)) {
    return { kind: "invalid_amount" };
  }
  const expected = expectedCash(sessionMovements);
  if (cashMovementDirection(movement.kind) === "in") {
    return { kind: "remaining", cash: expected + movement.amount };
  }
  if (movement.amount > expected) {
    return { kind: "exceeds_expected_cash", expected };
  }
  return { kind: "remaining", cash: expected - movement.amount };
}
