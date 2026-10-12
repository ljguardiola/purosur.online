import { mayBeCountedQuantity } from "./stock-quantity.js";

export interface CountResult {
  expected: number;
  delta: number;
}

export function expectedBalance(params: { balance: number; appliedAfterCount: number }): number {
  return params.balance - params.appliedAfterCount;
}

export function countResult(params: {
  counted: number;
  balance: number;
  appliedAfterCount: number;
}): CountResult {
  const expected = expectedBalance(params);
  return { expected, delta: params.counted - expected };
}

export function countedLotsTotal(lots: readonly { counted: number }[]): number {
  return lots.reduce((sum, lot) => sum + lot.counted, 0);
}

export function mayBeCountedTogether(lots: readonly { counted: number }[]): boolean {
  return mayBeCountedQuantity(countedLotsTotal(lots));
}
