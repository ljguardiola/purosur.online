export function mayBeSplitFromLot(lot: { remaining: number }, quantity: number): boolean {
  return Number.isInteger(quantity) && quantity > 0 && quantity < lot.remaining;
}
