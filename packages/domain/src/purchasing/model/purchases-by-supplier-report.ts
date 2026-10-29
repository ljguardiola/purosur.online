import { compareSpanishText } from "../../shared/index.js";
import { purchaseValueCents } from "./freight-distribution.js";
import type { PurchaseLineCost } from "./purchase-line.js";

export interface PurchasedLine extends PurchaseLineCost {
  purchaseId: string;
  supplierId: string;
  supplierName: string;
  purchasedOn: string;
}

interface SupplierMonthPurchases {
  month: string;
  purchases: number;
  amount: number;
}

interface SupplierPurchases {
  supplierId: string;
  name: string;
  months: SupplierMonthPurchases[];
  purchases: number;
  amount: number;
}

export interface PurchasesBySupplier {
  suppliers: SupplierPurchases[];
  totals: { suppliers: number; purchases: number; amount: number };
}

interface Tally {
  purchaseIds: Set<string>;
  lines: PurchasedLine[];
}

function tallied(tally: Tally | undefined, line: PurchasedLine): Tally {
  const current = tally ?? { purchaseIds: new Set<string>(), lines: [] };
  current.purchaseIds.add(line.purchaseId);
  current.lines.push(line);
  return current;
}

function amountOf({ lines }: Tally): number {
  return purchaseValueCents(lines);
}

interface SupplierTally extends Tally {
  name: string;
  months: Map<string, Tally>;
}

export function purchasesBySupplier(lines: readonly PurchasedLine[]): PurchasesBySupplier {
  const bySupplier = new Map<string, SupplierTally>();
  let everything: Tally | undefined;
  for (const line of lines) {
    const month = line.purchasedOn.slice(0, 7);
    const supplier = bySupplier.get(line.supplierId);
    bySupplier.set(line.supplierId, {
      ...tallied(supplier, line),
      name: line.supplierName,
      months: (supplier?.months ?? new Map<string, Tally>()).set(
        month,
        tallied(supplier?.months.get(month), line),
      ),
    });
    everything = tallied(everything, line);
  }
  const suppliers = [...bySupplier.entries()]
    .map(([supplierId, tally]) => ({
      supplierId,
      name: tally.name,
      months: [...tally.months.entries()]
        .sort(([a], [b]) => compareSpanishText(a, b))
        .map(([month, monthTally]) => ({
          month,
          purchases: monthTally.purchaseIds.size,
          amount: amountOf(monthTally),
        })),
      purchases: tally.purchaseIds.size,
      amount: amountOf(tally),
    }))
    .sort(
      (a, b) =>
        compareSpanishText(a.name, b.name) || compareSpanishText(a.supplierId, b.supplierId),
    );
  return {
    suppliers,
    totals: {
      suppliers: suppliers.length,
      purchases: everything?.purchaseIds.size ?? 0,
      amount: everything === undefined ? 0 : amountOf(everything),
    },
  };
}
