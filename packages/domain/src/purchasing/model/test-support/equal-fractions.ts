import type { Fraction } from "../../../shared/index.js";

export function equalFractions(left: Fraction, right: Fraction): boolean {
  return left.numerator * right.denominator === right.numerator * left.denominator;
}
