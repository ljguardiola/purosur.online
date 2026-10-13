import { roundHalfUp } from "../../shared/index.js";

export interface LotCost {
  totalCents: number;
  quantity: number;
}

export function knownLotCost({
  cost,
  costIncomplete,
}: {
  cost: LotCost | null;
  costIncomplete: boolean;
}): LotCost | null {
  return costIncomplete ? null : cost;
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
  const known = knownLotCost({ cost, costIncomplete });
  if (known === null) {
    return null;
  }
  const value = roundHalfUp({
    numerator: BigInt(Math.abs(remaining)) * BigInt(known.totalCents),
    denominator: BigInt(known.quantity),
  });
  // Adding zero turns the negative zero of a debt that rounds to nothing into a plain zero.
  return Math.sign(remaining) * value + 0;
}
