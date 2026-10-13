import { saleUnitOfWeightSource, soldQuantity } from "./sale-line.js";
import type { WeightSource } from "./weight-source.js";

export const SALES_REPORT_GROUPS = ["product", "category"] as const;

export type SalesReportGroup = (typeof SALES_REPORT_GROUPS)[number];

export interface SoldLinesOfGroup {
  id: string | null;
  path: readonly string[];
  weightSource: WeightSource | null;
  quantity: number;
  amount: number;
}

export interface SoldTotals {
  units: number;
  thousandths: number;
  amount: number;
}

export interface SalesOfGroup extends SoldTotals {
  id: string | null;
  path: readonly string[];
}

function pathOrder(a: SalesOfGroup, b: SalesOfGroup): number {
  return a.path.join().localeCompare(b.path.join());
}

export function salesOfGroups(rows: readonly SoldLinesOfGroup[]): SalesOfGroup[] {
  const groups = new Map<string | null, SalesOfGroup>();
  for (const row of rows) {
    const group = groups.get(row.id) ?? {
      id: row.id,
      path: row.path,
      units: 0,
      thousandths: 0,
      amount: 0,
    };
    const sold = soldQuantity({
      quantity: row.quantity,
      saleUnit: saleUnitOfWeightSource(row.weightSource),
    });
    groups.set(row.id, {
      ...group,
      units: group.units + (sold.saleUnit === "UNIT" ? sold.units : 0),
      thousandths: group.thousandths + (sold.saleUnit === "KG" ? sold.thousandths : 0),
      amount: group.amount + row.amount,
    });
  }
  return [...groups.values()].sort((a, b) => b.amount - a.amount || pathOrder(a, b));
}

export function soldTotals(groups: readonly SalesOfGroup[]): SoldTotals {
  return {
    units: groups.reduce((sum, group) => sum + group.units, 0),
    thousandths: groups.reduce((sum, group) => sum + group.thousandths, 0),
    amount: groups.reduce((sum, group) => sum + group.amount, 0),
  };
}
