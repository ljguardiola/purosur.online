export interface Fraction {
  numerator: bigint;
  denominator: bigint;
}

export function roundHalfUp({ numerator, denominator }: Fraction): number {
  return Number((2n * numerator + denominator) / (2n * denominator));
}

// Integer division truncates towards zero, so a negative numerator is first moved onto a
// non-negative remainder above the whole part below the quotient.
export function roundHalfUpSigned({ numerator, denominator }: Fraction): number {
  const wholes = numerator / denominator - 1n;
  return Number(wholes) + roundHalfUp({ numerator: numerator - wholes * denominator, denominator });
}
