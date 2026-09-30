export interface Fraction {
  numerator: bigint;
  denominator: bigint;
}

export function roundHalfUp({ numerator, denominator }: Fraction): number {
  return Number((2n * numerator + denominator) / (2n * denominator));
}
