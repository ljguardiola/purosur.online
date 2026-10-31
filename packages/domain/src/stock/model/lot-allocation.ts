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
  return (
    kind === "sale" ||
    kind === "sale_void" ||
    kind === "return" ||
    kind === "loss" ||
    kind === "adjustment" ||
    kind === "assembly_out" ||
    kind === "assembly_void"
  );
}

function compareNullsLast(a: string | null, b: string | null): number {
  if (a === null || b === null) {
    return Number(a === null) - Number(b === null);
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareFirstToConsume(
  a: Pick<StockLot, "id" | "expiresOn" | "purchasedOn">,
  b: Pick<StockLot, "id" | "expiresOn" | "purchasedOn">,
): number {
  return (
    compareNullsLast(a.expiresOn, b.expiresOn) ||
    compareNullsLast(a.purchasedOn, b.purchasedOn) ||
    compareNullsLast(a.id, b.id)
  );
}

function compareMostRecentlyReceived(a: StockLot, b: StockLot): number {
  return b.receivedAt.getTime() - a.receivedAt.getTime() || compareNullsLast(b.id, a.id);
}

export function lotTarget(lotId: string): LotAllocationTarget {
  return { kind: "lot", lotId };
}

export function shortfallTarget(lots: readonly StockLot[]): LotAllocationTarget {
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
  const inDebt = lots.filter((lot) => lot.remaining < 0);
  const carried = inDebt.reduce((sum, lot) => sum + lot.remaining, quantity);
  return [
    ...(carried === 0 ? [] : [{ target: lotTarget(newLotId), quantity: carried }]),
    ...inDebt.map((lot) => ({ target: lotTarget(lot.id), quantity: -lot.remaining })),
  ];
}

export function voidedMovementAllocations(
  lots: readonly StockLot[],
  originalAllocations: readonly { lotId: string; quantity: number }[],
  delta: number,
): PlannedLotAllocation[] {
  const returned = new Map<string, number>();
  for (const { lotId, quantity } of originalAllocations) {
    returned.set(lotId, (returned.get(lotId) ?? 0) - quantity);
  }
  const uncovered = [...returned.values()].reduce((rest, quantity) => rest - quantity, delta);
  const target = shortfallTarget(lots);
  if (target.kind === "lot") {
    returned.set(target.lotId, (returned.get(target.lotId) ?? 0) + uncovered);
  }
  const allocations = [...returned]
    .filter(([, quantity]) => quantity !== 0)
    .map(([lotId, quantity]) => ({ target: lotTarget(lotId), quantity }));
  return target.kind === "lot" || uncovered === 0
    ? allocations
    : [...allocations, { target, quantity: uncovered }];
}

export function restockedReturnAllocations(
  lots: readonly StockLot[],
  saleAllocations: readonly { lotId: string; quantity: number }[],
  returnedAllocations: readonly { lotId: string; quantity: number }[],
  delta: number,
): PlannedLotAllocation[] {
  const room = new Map<string, number>();
  for (const { lotId, quantity } of saleAllocations) {
    room.set(lotId, (room.get(lotId) ?? 0) - quantity);
  }
  for (const { lotId, quantity } of returnedAllocations) {
    room.set(lotId, (room.get(lotId) ?? 0) - quantity);
  }

  const known = new Map(lots.map((lot) => [lot.id, lot]));
  const withRoom = [...room].filter(([, quantity]) => quantity > 0);
  const listed = withRoom
    .flatMap(([lotId, quantity]) => {
      const lot = known.get(lotId);
      return lot ? [{ lot, quantity }] : [];
    })
    .sort((a, b) => compareFirstToConsume(b.lot, a.lot));
  const unlisted = withRoom
    .filter(([lotId]) => !known.has(lotId))
    .map(([lotId, quantity]) => ({ lotId, quantity }));

  const allocations: PlannedLotAllocation[] = [];
  let uncovered = delta;
  for (const { lotId, quantity } of [
    ...listed.map((entry) => ({ lotId: entry.lot.id, quantity: entry.quantity })),
    ...unlisted,
  ]) {
    if (uncovered === 0) {
      break;
    }
    const given = Math.min(quantity, uncovered);
    allocations.push({ target: lotTarget(lotId), quantity: given });
    uncovered -= given;
  }
  if (uncovered === 0) {
    return allocations;
  }

  const target = shortfallTarget(lots);
  const filled = allocations.find((allocation) => sameTarget(allocation.target, target));
  if (filled) {
    filled.quantity += uncovered;
  } else {
    allocations.push({ target, quantity: uncovered });
  }
  return allocations;
}
