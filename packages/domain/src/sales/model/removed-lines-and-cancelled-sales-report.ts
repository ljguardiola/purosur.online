import { cancelledBeforeCharge } from "./cancelled-before-charge.js";
import { codeUnitOrder, nameOrder } from "./report-order.js";
import type { SaleState } from "./sale.js";
import { saleUnitOfWeightSource, soldQuantity } from "./sale-line.js";
import type { WeightSource } from "./weight-source.js";

export const CANCELLED_SALES_REPORT_SALE_STATE = "CANCELLED" satisfies SaleState;

interface SessionAndCashier {
  sessionId: string;
  registerName: string;
  openedAt: Date;
  cashierId: string;
  cashierName: string | null;
}

export interface RemovedLinesGroup extends SessionAndCashier {
  weightSource: WeightSource | null;
  lines: number;
  quantity: number;
  amount: number;
}

export interface CancelledSaleFacts extends SessionAndCashier {
  saleId: string;
  total: number;
  paymentStates: readonly string[];
  lines: readonly { weightSource: WeightSource | null; quantity: number }[];
}

export interface RemovalFacts {
  removedLines: readonly RemovedLinesGroup[];
  cancelledSales: readonly CancelledSaleFacts[];
}

interface Quantities {
  units: number;
  thousandths: number;
  amount: number;
}

interface RemovedTally extends Quantities {
  lines: number;
}

interface CancelledTally extends Quantities {
  sales: number;
}

export interface RemovalsOfCashier {
  cashierId: string;
  name: string | null;
  removed: RemovedTally;
  cancelled: CancelledTally;
}

export interface RemovalsOfSession {
  sessionId: string;
  registerName: string;
  openedAt: Date;
  removed: RemovedTally;
  cancelled: CancelledTally;
}

export interface RemovalsTotals {
  removed: RemovedTally;
  cancelled: CancelledTally;
}

export interface RemovalsTally {
  cashiers: RemovalsOfCashier[];
  sessions: RemovalsOfSession[];
  totals: RemovalsTotals;
}

function emptyTotals(): RemovalsTotals {
  return {
    removed: { lines: 0, units: 0, thousandths: 0, amount: 0 },
    cancelled: { sales: 0, units: 0, thousandths: 0, amount: 0 },
  };
}

function addQuantity(
  tally: Quantities,
  line: { weightSource: WeightSource | null; quantity: number },
): void {
  const sold = soldQuantity({
    quantity: line.quantity,
    saleUnit: saleUnitOfWeightSource(line.weightSource),
  });
  tally.units += sold.saleUnit === "UNIT" ? sold.units : 0;
  tally.thousandths += sold.saleUnit === "KG" ? sold.thousandths : 0;
}

function addRemoved(totals: RemovalsTotals, group: RemovedLinesGroup): void {
  totals.removed.lines += group.lines;
  totals.removed.amount += group.amount;
  addQuantity(totals.removed, group);
}

function addCancelled(totals: RemovalsTotals, sale: CancelledSaleFacts): void {
  totals.cancelled.sales += 1;
  totals.cancelled.amount += sale.total;
  for (const line of sale.lines) {
    addQuantity(totals.cancelled, line);
  }
}

function amountOf({ removed, cancelled }: RemovalsTotals): number {
  return removed.amount + cancelled.amount;
}

export function tallyRemovals({ removedLines, cancelledSales }: RemovalFacts): RemovalsTally {
  const cashiers = new Map<string, RemovalsOfCashier>();
  const sessions = new Map<string, RemovalsOfSession>();
  const totals = emptyTotals();

  const cashierOf = (facts: SessionAndCashier): RemovalsOfCashier => {
    const row = cashiers.get(facts.cashierId) ?? {
      cashierId: facts.cashierId,
      name: facts.cashierName,
      ...emptyTotals(),
    };
    cashiers.set(facts.cashierId, row);
    return row;
  };
  const sessionOf = (facts: SessionAndCashier): RemovalsOfSession => {
    const row = sessions.get(facts.sessionId) ?? {
      sessionId: facts.sessionId,
      registerName: facts.registerName,
      openedAt: facts.openedAt,
      ...emptyTotals(),
    };
    sessions.set(facts.sessionId, row);
    return row;
  };

  for (const group of removedLines) {
    addRemoved(cashierOf(group), group);
    addRemoved(sessionOf(group), group);
    addRemoved(totals, group);
  }
  for (const sale of cancelledSales) {
    if (!cancelledBeforeCharge(sale.paymentStates.map((state) => ({ state })))) {
      continue;
    }
    addCancelled(cashierOf(sale), sale);
    addCancelled(sessionOf(sale), sale);
    addCancelled(totals, sale);
  }

  return {
    cashiers: [...cashiers.values()].sort(
      (a, b) =>
        amountOf(b) - amountOf(a) ||
        nameOrder(a.name, b.name) ||
        codeUnitOrder(a.cashierId, b.cashierId),
    ),
    sessions: [...sessions.values()].sort(
      (a, b) =>
        amountOf(b) - amountOf(a) ||
        b.openedAt.getTime() - a.openedAt.getTime() ||
        codeUnitOrder(a.sessionId, b.sessionId),
    ),
    totals,
  };
}
