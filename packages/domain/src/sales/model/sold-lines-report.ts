import { codeUnitOrder } from "./report-order.js";
import { saleUnitOfWeightSource, soldQuantity } from "./sale-line.js";
import type { WeightSource } from "./weight-source.js";

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

const PATH_ORDER_SEPARATOR = "\u0000";

function groupOrder(a: SalesOfGroup, b: SalesOfGroup): number {
  return (
    b.amount - a.amount ||
    codeUnitOrder(a.path.join(PATH_ORDER_SEPARATOR), b.path.join(PATH_ORDER_SEPARATOR)) ||
    codeUnitOrder(String(a.id), String(b.id))
  );
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
  return [...groups.values()].sort(groupOrder);
}

export function soldTotals(groups: readonly SalesOfGroup[]): SoldTotals {
  return {
    units: groups.reduce((sum, group) => sum + group.units, 0),
    thousandths: groups.reduce((sum, group) => sum + group.thousandths, 0),
    amount: groups.reduce((sum, group) => sum + group.amount, 0),
  };
}
