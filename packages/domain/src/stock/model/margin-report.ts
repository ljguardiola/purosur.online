import type { ProductBrandAndNetContent } from "../../catalog/index.js";
import { compareSpanishText } from "../../shared/index.js";
import { isLotCostIncomplete, type LotCost, lotValueCents } from "./lot-value.js";

export interface MarginAllocation {
  lotId: string;
  movementKind: "sale" | "return";
  quantity: number;
  technical: boolean;
  costIncomplete: boolean;
  cost: LotCost | null;
}

export interface MarginSaleLine extends ProductBrandAndNetContent {
  saleId: string;
  id: string | null;
  path: readonly string[];
  amount: number;
  allocations: readonly MarginAllocation[];
}

export interface MarginTotals {
  amount: number;
  cost: number;
  margin: number;
  incompleteSales: number;
}

export interface MarginOfGroup extends MarginTotals, ProductBrandAndNetContent {
  id: string | null;
  path: readonly string[];
}

export interface MarginReport {
  rows: MarginOfGroup[];
  totals: MarginTotals;
}

const PATH_ORDER_SEPARATOR = "\u0000";

function costOfSales(allocations: readonly MarginAllocation[]): number {
  const netByLot = new Map<string, { net: number; allocation: MarginAllocation }>();
  for (const allocation of allocations) {
    const lot = netByLot.get(allocation.lotId);
    netByLot.set(allocation.lotId, {
      net: (lot?.net ?? 0) + allocation.quantity,
      allocation: lot?.allocation ?? allocation,
    });
  }
  let cost = 0;
  for (const { net, allocation } of netByLot.values()) {
    const value = lotValueCents({
      remaining: net,
      cost: allocation.cost,
      costIncomplete: isLotCostIncomplete(allocation),
    });
    cost -= value ?? 0;
  }
  return cost;
}

function hasIncompleteCost(allocations: readonly MarginAllocation[]): boolean {
  return allocations.some(
    (allocation) => allocation.movementKind === "sale" && isLotCostIncomplete(allocation),
  );
}

function rowOrder(a: MarginOfGroup, b: MarginOfGroup): number {
  return (
    b.amount - a.amount ||
    compareSpanishText(a.path.join(PATH_ORDER_SEPARATOR), b.path.join(PATH_ORDER_SEPARATOR)) ||
    compareSpanishText(String(a.id), String(b.id))
  );
}

export function marginReport(lines: readonly MarginSaleLine[]): MarginReport {
  const groups = new Map<string | null, MarginOfGroup>();
  const incompleteSalesOfGroup = new Map<string | null, Set<string>>();
  const incompleteSales = new Set<string>();
  for (const line of lines) {
    const group = groups.get(line.id) ?? {
      id: line.id,
      path: line.path,
      brandName: line.brandName,
      netContent: line.netContent,
      amount: 0,
      cost: 0,
      margin: 0,
      incompleteSales: 0,
    };
    const amount = group.amount + line.amount;
    const cost = group.cost + costOfSales(line.allocations);
    const flagged = incompleteSalesOfGroup.get(line.id) ?? new Set<string>();
    if (hasIncompleteCost(line.allocations)) {
      flagged.add(line.saleId);
      incompleteSales.add(line.saleId);
    }
    incompleteSalesOfGroup.set(line.id, flagged);
    groups.set(line.id, {
      ...group,
      amount,
      cost,
      margin: amount - cost,
      incompleteSales: flagged.size,
    });
  }
  const rows = [...groups.values()].sort(rowOrder);
  const amount = rows.reduce((sum, row) => sum + row.amount, 0);
  const cost = rows.reduce((sum, row) => sum + row.cost, 0);
  return {
    rows,
    totals: { amount, cost, margin: amount - cost, incompleteSales: incompleteSales.size },
  };
}
