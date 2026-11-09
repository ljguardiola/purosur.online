import { roundHalfUp } from "./rounding.js";

export function averageTicket({
  total,
  salesCount,
}: {
  total: number;
  salesCount: number;
}): number | null {
  if (salesCount === 0) {
    return null;
  }
  return roundHalfUp({ numerator: BigInt(total), denominator: BigInt(salesCount) });
}
