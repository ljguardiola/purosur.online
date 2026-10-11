import type { StockMovementKind } from "./stock-movement-kind.js";

export interface StockLot {
  id: string;
  technical: boolean;
  expiresOn: string | null;
  purchasedOn: string | null;
  receivedAt: Date;
  remaining: number;
}

export type LotAllocationTarget = { kind: "lot"; lotId: string } | { kind: "new_technical_lot" };

export interface PlannedLotAllocation {
  target: LotAllocationTarget;
  quantity: number;
}

export function allocatesToLots(kind: StockMovementKind): boolean {
  return kind === "sale" || kind === "loss" || kind === "adjustment";
}

function compareNullsLast(a: string | null, b: string | null): number {
  if (a === b) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return a < b ? -1 : 1;
}

function compareFirstToConsume(a: StockLot, b: StockLot): number {
  return (
    compareNullsLast(a.expiresOn, b.expiresOn) ||
    compareNullsLast(a.purchasedOn, b.purchasedOn) ||
    compareNullsLast(a.id, b.id)
  );
}

function compareMostRecentlyReceived(a: StockLot, b: StockLot): number {
  return b.receivedAt.getTime() - a.receivedAt.getTime() || compareNullsLast(b.id, a.id);
}

function lotTarget(lotId: string): LotAllocationTarget {
  return { kind: "lot", lotId };
}

function shortfallTarget(lots: readonly StockLot[]): LotAllocationTarget {
  const [mostRecent] = lots.filter((lot) => !lot.technical).sort(compareMostRecentlyReceived);
  const lot = mostRecent ?? lots.find((candidate) => candidate.technical);
  return lot ? lotTarget(lot.id) : { kind: "new_technical_lot" };
}

function sameTarget(a: LotAllocationTarget, b: LotAllocationTarget): boolean {
  return a.kind === "lot" && b.kind === "lot" && a.lotId === b.lotId;
}

export function movementAllocations(
  lots: readonly StockLot[],
  delta: number,
): PlannedLotAllocation[] {
  if (delta === 0) {
    return [];
  }
  if (delta > 0) {
    return [{ target: shortfallTarget(lots), quantity: delta }];
  }

  const allocations: PlannedLotAllocation[] = [];
  let uncovered = -delta;
  for (const lot of lots
    .filter((candidate) => candidate.remaining > 0)
    .sort(compareFirstToConsume)) {
    if (uncovered === 0) {
      break;
    }
    const taken = Math.min(lot.remaining, uncovered);
    allocations.push({ target: lotTarget(lot.id), quantity: -taken });
    uncovered -= taken;
  }
  if (uncovered === 0) {
    return allocations;
  }

  const target = shortfallTarget(lots);
  const consumed = allocations.find((allocation) => sameTarget(allocation.target, target));
  if (consumed) {
    consumed.quantity -= uncovered;
  } else {
    allocations.push({ target, quantity: -uncovered });
  }
  return allocations;
}

export function receiptAllocations(
  newLotId: string,
  lots: readonly StockLot[],
  quantity: number,
): PlannedLotAllocation[] {
  const technical = lots.find((lot) => lot.technical);
  if (!technical || technical.remaining >= 0) {
    return [{ target: lotTarget(newLotId), quantity }];
  }
  const carried = quantity + technical.remaining;
  return [
    ...(carried === 0 ? [] : [{ target: lotTarget(newLotId), quantity: carried }]),
    { target: lotTarget(technical.id), quantity: -technical.remaining },
  ];
}
