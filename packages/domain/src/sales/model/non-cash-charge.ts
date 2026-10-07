export type NonCashCharge =
  | { kind: "invalid_amount" }
  | { kind: "exceeds_pending"; pending: number }
  | { kind: "partial"; applied: number; pending: number }
  | { kind: "covered"; applied: number };

export function nonCashCharge(pending: number, amount: number): NonCashCharge {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return { kind: "invalid_amount" };
  }
  if (amount > pending) {
    return { kind: "exceeds_pending", pending };
  }
  if (amount < pending) {
    return { kind: "partial", applied: amount, pending: pending - amount };
  }
  return { kind: "covered", applied: amount };
}
