import {
  compareFirstToConsume,
  type LotAllocationTarget,
  lotTarget,
  type PlannedLotAllocation,
  type StockLot,
  shortfallTarget,
} from "./lot-allocation.js";
import { isLotInStock } from "./lot-value.js";

export function lotsAtMoment<TLot extends StockLot>(
  lots: readonly TLot[],
  allocatedAfter: ReadonlyMap<string, number>,
): TLot[] {
  return lots.map((lot) => ({
    ...lot,
    remaining: lot.remaining - (allocatedAfter.get(lot.id) ?? 0),
  }));
}

export function isCountableByLot(lotAtMoment: StockLot): boolean {
  return !lotAtMoment.technical && isLotInStock(lotAtMoment);
}

function allocationsToTargets(
  lots: readonly StockLot[],
  targets: ReadonlyMap<string, number>,
): PlannedLotAllocation[] {
  return lots.flatMap((lot) => {
    const quantity = (targets.get(lot.id) ?? 0) - lot.remaining;
    return quantity === 0 ? [] : [{ target: lotTarget(lot.id), quantity }];
  });
}

export function countByLotAllocations(
  lotsAtTheMoment: readonly StockLot[],
  countedByLot: ReadonlyMap<string, number>,
): PlannedLotAllocation[] {
  return allocationsToTargets(lotsAtTheMoment, countedByLot);
}

function wasReceivedAfter(lot: StockLot, moment: Date): boolean {
  return lot.receivedAt.getTime() > moment.getTime();
}

export function countByProductAllocations(
  lotsAtTheMoment: readonly StockLot[],
  counted: number,
  moment: Date,
): PlannedLotAllocation[] {
  const targets = new Map<string, number>();
  let unplaced = counted;
  for (const lot of lotsAtTheMoment
    .filter((candidate) => !candidate.technical)
    .sort(compareFirstToConsume)
    .reverse()) {
    const placed = Math.min(Math.max(0, lot.remaining), unplaced);
    targets.set(lot.id, placed);
    unplaced -= placed;
  }
  if (unplaced === 0) {
    return allocationsToTargets(lotsAtTheMoment, targets);
  }

  const excessTarget: LotAllocationTarget = shortfallTarget(
    lotsAtTheMoment.filter((lot) => lot.technical || !wasReceivedAfter(lot, moment)),
  );
  if (excessTarget.kind === "new_technical_lot") {
    return [
      ...allocationsToTargets(lotsAtTheMoment, targets),
      { target: excessTarget, quantity: unplaced },
    ];
  }
  targets.set(excessTarget.lotId, (targets.get(excessTarget.lotId) ?? 0) + unplaced);
  return allocationsToTargets(lotsAtTheMoment, targets);
}
