import { roundHalfUp } from "../../shared/index.js";

export interface LotCost {
  totalCents: number;
  quantity: number;
}

export function isLotInStock({ remaining }: { remaining: number }): boolean {
  return remaining !== 0;
}

export function lotValueCents({
  remaining,
  cost,
  costIncomplete,
}: {
  remaining: number;
  cost: LotCost | null;
  costIncomplete: boolean;
}): number | null {
  if (cost === null || costIncomplete) {
    return null;
  }
  const value = roundHalfUp({
    numerator: BigInt(Math.abs(remaining)) * BigInt(cost.totalCents),
    denominator: BigInt(cost.quantity),
  });
  // Adding zero turns the negative zero of a debt that rounds to nothing into a plain zero.
  return Math.sign(remaining) * value + 0;
}
