import { compareSpanishText, type Fraction, roundHalfUp } from "../../shared/index.js";
import { lineValue, type PurchaseLineCost } from "./purchase-line.js";

export interface PurchasedLine extends PurchaseLineCost {
  purchaseId: string;
  supplierId: string;
  supplierName: string;
  purchasedOn: string;
}

export interface SupplierMonthPurchases {
  month: string;
  purchases: number;
  amount: number;
}

export interface SupplierPurchases {
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
  value: Fraction;
}

function greatestCommonDivisor(a: bigint, b: bigint): bigint {
  return b === 0n ? a : greatestCommonDivisor(b, a % b);
}

function addedTo({ value }: Tally, line: PurchasedLine): Fraction {
  const added = lineValue(line);
  const numerator = value.numerator * added.denominator + added.numerator * value.denominator;
  const denominator = value.denominator * added.denominator;
  const divisor = greatestCommonDivisor(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

function tallied(tally: Tally | undefined, line: PurchasedLine): Tally {
  const current = tally ?? {
    purchaseIds: new Set<string>(),
    value: { numerator: 0n, denominator: 1n },
  };
  return {
    purchaseIds: current.purchaseIds.add(line.purchaseId),
    value: addedTo(current, line),
  };
}

function amountOf({ value }: Tally): number {
  return roundHalfUp(value);
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
