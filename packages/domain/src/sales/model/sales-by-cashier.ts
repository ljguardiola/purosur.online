import { averageTicket } from "./average-ticket.js";

export interface SoldByCashier {
  cashierId: string;
  name: string | null;
  sessions: number;
  salesCount: number;
  total: number;
}

export interface SalesOfCashier extends SoldByCashier {
  averageTicket: number | null;
}

export interface CashierSalesTotals {
  cashiers: number;
  salesCount: number;
  total: number;
  averageTicket: number | null;
}

function codeUnitOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function nameOrder(a: string | null, b: string | null): number {
  if (a === null || b === null) {
    return Number(a === null) - Number(b === null);
  }
  return codeUnitOrder(a, b);
}

function cashierOrder(a: SoldByCashier, b: SoldByCashier): number {
  return (
    b.salesCount - a.salesCount ||
    b.total - a.total ||
    nameOrder(a.name, b.name) ||
    codeUnitOrder(a.cashierId, b.cashierId)
  );
}

export function salesOfCashiers(rows: readonly SoldByCashier[]): SalesOfCashier[] {
  return rows
    .map((row) => ({
      ...row,
      averageTicket: averageTicket({ total: row.total, salesCount: row.salesCount }),
    }))
    .sort(cashierOrder);
}

export function cashierSalesTotals(rows: readonly SoldByCashier[]): CashierSalesTotals {
  const salesCount = rows.reduce((sum, row) => sum + row.salesCount, 0);
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  return {
    cashiers: rows.length,
    salesCount,
    total,
    averageTicket: averageTicket({ total, salesCount }),
  };
}
