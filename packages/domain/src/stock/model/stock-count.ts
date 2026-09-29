export interface CountResult {
  expected: number;
  delta: number;
}

export function countResult(params: {
  counted: number;
  balance: number;
  appliedAfterCount: number;
}): CountResult {
  const expected = params.balance - params.appliedAfterCount;
  return { expected, delta: params.counted - expected };
}
