import type { ProductBrandAndNetContent } from "../../catalog/index.js";
import {
  compareCodeUnits,
  compareSpanishPaths,
  marginTenthsOfPercent,
} from "../../shared/index.js";
import { type LotCostChange, lotCostAt } from "./lot-cost-at.js";
import { isLotCostIncomplete, type LotCost, lotValueCents } from "./lot-value.js";
import type { StockMovementKind } from "./stock-movement-kind.js";

export const COST_OF_SALE_MOVEMENT_KINDS = [
  "sale",
  "return",
  "exchange_out",
] as const satisfies readonly StockMovementKind[];

export type CostOfSaleMovementKind = (typeof COST_OF_SALE_MOVEMENT_KINDS)[number];

export function isCostOfSaleMovementKind(kind: string): kind is CostOfSaleMovementKind {
  return COST_OF_SALE_MOVEMENT_KINDS.some((costOfSaleKind) => costOfSaleKind === kind);
}

export interface MarginAllocation {
  lotId: string;
  movementKind: CostOfSaleMovementKind;
  quantity: number;
  technical: boolean;
  costIncomplete: boolean;
  cost: LotCost | null;
  costChanges: readonly LotCostChange[];
  valuedAt: Date;
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
  marginTenthsOfPercent: number | null;
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

interface LotNet {
  net: number;
  allocation: MarginAllocation;
}

function netByLotAndCost(allocations: readonly MarginAllocation[]): LotNet[] {
  const lots = new Map<string, LotNet>();
  for (const allocation of allocations) {
    const cost = lotCostAt(allocation, allocation.valuedAt);
    const key = `${allocation.lotId}:${cost === null ? "unknown" : `${cost.totalCents}/${cost.quantity}`}`;
    const lot = lots.get(key);
    lots.set(key, {
      net: (lot?.net ?? 0) + allocation.quantity,
      allocation: lot?.allocation ?? { ...allocation, cost },
    });
  }
  return [...lots.values()];
}

function costOfSales(allocations: readonly MarginAllocation[]): number {
  let cost = 0;
  for (const { net, allocation } of netByLotAndCost(allocations)) {
    const value = lotValueCents({
      remaining: Math.min(net, 0),
      cost: allocation.cost,
      costIncomplete: isLotCostIncomplete(allocation),
    });
    cost -= value ?? 0;
  }
  return cost;
}

function hasIncompleteCost(allocations: readonly MarginAllocation[]): boolean {
  const lots = netByLotAndCost(allocations);
  return (
    lots.length === 0 ||
    lots.some(({ net, allocation }) => net > 0 || isLotCostIncomplete(allocation))
  );
}

function marginOverAmount(amount: number, cost: number): number | null {
  return marginTenthsOfPercent(
    { numerator: BigInt(amount), denominator: 1n },
    { numerator: BigInt(cost), denominator: 1n },
  );
}

function rowOrder(a: MarginOfGroup, b: MarginOfGroup): number {
  return (
    b.amount - a.amount ||
    compareSpanishPaths(a.path, b.path) ||
    compareCodeUnits(String(a.id), String(b.id))
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
      marginTenthsOfPercent: null,
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
      marginTenthsOfPercent: marginOverAmount(amount, cost),
      incompleteSales: flagged.size,
    });
  }
  const rows = [...groups.values()].sort(rowOrder);
  const amount = rows.reduce((sum, row) => sum + row.amount, 0);
  const cost = rows.reduce((sum, row) => sum + row.cost, 0);
  return {
    rows,
    totals: {
      amount,
      cost,
      margin: amount - cost,
      marginTenthsOfPercent: marginOverAmount(amount, cost),
      incompleteSales: incompleteSales.size,
    },
  };
}
