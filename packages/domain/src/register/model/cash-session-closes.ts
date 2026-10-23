import { compareSpanishText } from "../../shared/index.js";

export interface CashSessionClose {
  id: string;
  closedAt: Date;
  registerId: string;
  registerName: string;
  cashierId: string;
  cashierName: string | null;
  closedById: string;
  closedByName: string | null;
  expectedCash: number;
  countedCash: number;
  difference: number;
}

export interface ReportedCashSessionClose extends CashSessionClose {
  hasDifference: boolean;
}

export interface CashierWithDifferences {
  cashierId: string;
  cashierName: string | null;
  sessions: number;
}

export interface CashSessionClosesTotals {
  sessions: number;
  netDifference: number;
  withDifference: number;
  cashiersWithDifference: CashierWithDifferences[];
}

export interface CashSessionClosesSummary {
  closes: ReportedCashSessionClose[];
  totals: CashSessionClosesTotals;
}

export function hasCashDifference(difference: number): boolean {
  return difference !== 0;
}

function codeUnitOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function closeOrder(a: CashSessionClose, b: CashSessionClose): number {
  return b.closedAt.getTime() - a.closedAt.getTime() || codeUnitOrder(a.id, b.id);
}

function nameOrder(a: string | null, b: string | null): number {
  if (a === null || b === null) {
    return Number(a === null) - Number(b === null);
  }
  return compareSpanishText(a, b);
}

function cashierOrder(a: CashierWithDifferences, b: CashierWithDifferences): number {
  return (
    b.sessions - a.sessions ||
    nameOrder(a.cashierName, b.cashierName) ||
    codeUnitOrder(a.cashierId, b.cashierId)
  );
}

function cashiersWithDifference(closes: readonly CashSessionClose[]): CashierWithDifferences[] {
  const byCashier = new Map<string, CashierWithDifferences>();
  for (const close of closes) {
    if (!hasCashDifference(close.difference)) {
      continue;
    }
    const held = byCashier.get(close.cashierId);
    if (held === undefined) {
      byCashier.set(close.cashierId, {
        cashierId: close.cashierId,
        cashierName: close.cashierName,
        sessions: 1,
      });
    } else {
      held.sessions += 1;
    }
  }
  return [...byCashier.values()].sort(cashierOrder);
}

export function cashSessionClosesSummary(
  closes: readonly CashSessionClose[],
): CashSessionClosesSummary {
  const reported = closes
    .map((close) => ({ ...close, hasDifference: hasCashDifference(close.difference) }))
    .sort(closeOrder);
  return {
    closes: reported,
    totals: {
      sessions: reported.length,
      netDifference: reported.reduce((sum, close) => sum + close.difference, 0),
      withDifference: reported.filter((close) => close.hasDifference).length,
      cashiersWithDifference: cashiersWithDifference(closes),
    },
  };
}
