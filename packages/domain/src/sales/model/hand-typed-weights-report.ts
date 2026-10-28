import { codeUnitOrder, nameOrder } from "./report-order.js";
import type { WeightSource } from "./weight-source.js";

export interface SaleLinesGroup {
  sessionId: string;
  registerName: string;
  openedAt: Date;
  cashierId: string;
  cashierName: string | null;
  weightSource: WeightSource | null;
  lines: number;
}

interface WeighedLinesCount {
  weighedLines: number;
  typedLines: number;
}

export interface WeighedLinesTotals extends WeighedLinesCount {
  mostTyped: { cashierId: string; name: string | null; typedLines: number } | null;
}

export interface WeighedLinesOfCashier extends WeighedLinesCount {
  cashierId: string;
  name: string | null;
}

export interface WeighedLinesOfSession extends WeighedLinesCount {
  sessionId: string;
  registerName: string;
  openedAt: Date;
}

function emptyCount(): WeighedLinesCount {
  return { weighedLines: 0, typedLines: 0 };
}

function addGroup(count: WeighedLinesCount, group: SaleLinesGroup): void {
  if (group.weightSource === null) {
    return;
  }
  count.weighedLines += group.lines;
  if (group.weightSource === "MANUAL") {
    count.typedLines += group.lines;
  }
}

function moreTypedOrder(a: WeighedLinesCount, b: WeighedLinesCount): number {
  return b.typedLines - a.typedLines || b.weighedLines - a.weighedLines;
}

function countsBy<TKey extends { id: string }, TRow extends WeighedLinesCount>(
  groups: readonly SaleLinesGroup[],
  keyOf: (group: SaleLinesGroup) => TKey,
  rowOf: (key: TKey, count: WeighedLinesCount) => TRow,
): TRow[] {
  const counted = new Map<string, { key: TKey; count: WeighedLinesCount }>();
  for (const group of groups) {
    const key = keyOf(group);
    const entry = counted.get(key.id) ?? { key, count: emptyCount() };
    addGroup(entry.count, group);
    counted.set(key.id, entry);
  }
  return [...counted.values()]
    .filter(({ count }) => count.weighedLines > 0)
    .map(({ key, count }) => rowOf(key, count));
}

export function weighedLinesByCashier(groups: readonly SaleLinesGroup[]): WeighedLinesOfCashier[] {
  return countsBy(
    groups,
    (group) => ({ id: group.cashierId, name: group.cashierName }),
    (key, count) => ({ cashierId: key.id, name: key.name, ...count }),
  ).sort(
    (a, b) =>
      moreTypedOrder(a, b) || nameOrder(a.name, b.name) || codeUnitOrder(a.cashierId, b.cashierId),
  );
}

export function weighedLinesBySession(groups: readonly SaleLinesGroup[]): WeighedLinesOfSession[] {
  return countsBy(
    groups,
    (group) => ({
      id: group.sessionId,
      registerName: group.registerName,
      openedAt: group.openedAt,
    }),
    (key, count) => ({
      sessionId: key.id,
      registerName: key.registerName,
      openedAt: key.openedAt,
      ...count,
    }),
  ).sort(
    (a, b) =>
      moreTypedOrder(a, b) ||
      b.openedAt.getTime() - a.openedAt.getTime() ||
      codeUnitOrder(a.sessionId, b.sessionId),
  );
}

export function weighedLinesTotals(groups: readonly SaleLinesGroup[]): WeighedLinesTotals {
  const totals = emptyCount();
  for (const group of groups) {
    addGroup(totals, group);
  }
  const [mostTyped] = weighedLinesByCashier(groups);
  return {
    ...totals,
    mostTyped:
      mostTyped === undefined || mostTyped.typedLines === 0
        ? null
        : {
            cashierId: mostTyped.cashierId,
            name: mostTyped.name,
            typedLines: mostTyped.typedLines,
          },
  };
}
