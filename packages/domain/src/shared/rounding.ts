export interface Fraction {
  numerator: bigint;
  denominator: bigint;
}

export function roundHalfUp({ numerator, denominator }: Fraction): number {
  const doubled = 2n * numerator + denominator;
  const divisor = 2n * denominator;
  const quotient = doubled / divisor;
  // Integer division truncates towards zero, so a negative quotient with a remainder steps down to
  // its floor.
  return Number(doubled % divisor < 0n ? quotient - 1n : quotient);
}

export function compareFractions(a: Fraction, b: Fraction): number {
  const difference = a.numerator * b.denominator - b.numerator * a.denominator;
  return difference > 0n ? 1 : difference < 0n ? -1 : 0;
}
