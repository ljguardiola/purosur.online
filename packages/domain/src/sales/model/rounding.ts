export interface Fraction {
  numerator: bigint;
  denominator: bigint;
}

export function roundHalfUp({ numerator, denominator }: Fraction): number {
  const sign = numerator < 0n !== denominator < 0n ? -1n : 1n;
  const dividend = numerator < 0n ? -numerator : numerator;
  const divisor = denominator < 0n ? -denominator : denominator;
  const quotient = dividend / divisor;
  const roundsUp = 2n * (dividend % divisor) >= divisor;
  return Number(sign * (roundsUp ? quotient + 1n : quotient));
}
