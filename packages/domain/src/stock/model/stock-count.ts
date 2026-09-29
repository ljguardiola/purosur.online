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
