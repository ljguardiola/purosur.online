import { unitCostCents } from "./unit-cost.js";

export const STOCK_CORRECTIONS = ["count", "purchase_or_count"] as const;

export type StockCorrection = (typeof STOCK_CORRECTIONS)[number];

export function productValueCents(lotValues: readonly (number | null)[]): number | null {
  if (lotValues.length === 0 || lotValues.includes(null)) {
    return null;
  }
  return lotValues.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

export function productUnitCostCents({
  valueCents,
  balance,
}: {
  valueCents: number | null;
  balance: number;
}): number | null {
  if (valueCents === null || balance === 0) {
    return null;
  }
  const magnitude = unitCostCents(Math.abs(valueCents), Math.abs(balance));
  // Adding zero turns the negative zero of a cost that rounds to nothing into a plain zero.
  return Math.sign(valueCents) === Math.sign(balance) ? magnitude : -magnitude + 0;
}

export function stockCorrection({
  balance,
  hasPurchasedLot,
}: {
  balance: number;
  hasPurchasedLot: boolean;
}): StockCorrection | null {
  if (!hasPurchasedLot) {
    return "purchase_or_count";
  }
  return balance < 0 ? "count" : null;
}
