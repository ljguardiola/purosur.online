import type { Fraction } from "../../shared/index.js";
import { STOCK_QUANTITY_PER_UNIT } from "../../stock/index.js";

export interface SupplierItemKey {
  kind: "code" | "description";
  value: string;
}

export function normalizeSupplierItemDescription(description: string): string {
  return description
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function supplierItemKey(item: {
  code: string | null;
  description: string;
}): SupplierItemKey {
  const code = item.code?.trim() ?? "";
  return code === ""
    ? { kind: "description", value: normalizeSupplierItemDescription(item.description) }
    : { kind: "code", value: code };
}

// Basis points, so a rate is exact: 2100 is 21% and 1050 is 10.5%.
export const SUPPLIER_ITEM_VAT_RATES = [2100, 1050] as const;

export type SupplierItemVatRate = (typeof SUPPLIER_ITEM_VAT_RATES)[number];

export const DEFAULT_SUPPLIER_ITEM_VAT_RATE: SupplierItemVatRate = 2100;

const BASIS_POINTS_PER_UNIT = 10_000n;

export function isSupplierItemVatRate(rate: number): rate is SupplierItemVatRate {
  return (SUPPLIER_ITEM_VAT_RATES as readonly number[]).includes(rate);
}

// A list that does not say whether its prices include VAT is treated as excluding them.
export function requiresVatRate(pricesIncludeVat: boolean | null): boolean {
  return pricesIncludeVat !== true;
}

function greatestCommonDivisor(a: bigint, b: bigint): bigint {
  return b === 0n ? a : greatestCommonDivisor(b, a % b);
}

// Cents per sale unit, VAT included, as the reduced fraction of the price over the sale units the
// package holds; the quantity is in thousandths of a sale unit.
export function pricePerSaleUnit(item: {
  priceCents: number;
  pricesIncludeVat: boolean | null;
  vatRate: number | null;
  quantityPerPackage: number;
}): Fraction | null {
  const rateApplies = requiresVatRate(item.pricesIncludeVat);
  if (rateApplies && item.vatRate === null) {
    return null;
  }
  const withVat = BASIS_POINTS_PER_UNIT + (rateApplies ? BigInt(item.vatRate ?? 0) : 0n);
  const numerator = BigInt(item.priceCents) * withVat * BigInt(STOCK_QUANTITY_PER_UNIT);
  const denominator = BASIS_POINTS_PER_UNIT * BigInt(item.quantityPerPackage);
  const divisor = greatestCommonDivisor(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

export function compareFractions(a: Fraction, b: Fraction): number {
  const difference = a.numerator * b.denominator - b.numerator * a.denominator;
  return difference > 0n ? 1 : difference < 0n ? -1 : 0;
}

// The earliest offer wins a tie.
export function cheapestOffer<T extends { pricePerSaleUnit: Fraction }>(
  offers: readonly T[],
): T | undefined {
  let cheapest: T | undefined;
  for (const offer of offers) {
    if (
      cheapest === undefined ||
      compareFractions(offer.pricePerSaleUnit, cheapest.pricePerSaleUnit) < 0
    ) {
      cheapest = offer;
    }
  }
  return cheapest;
}

export const SUPPLIER_PRICE_LIST_ROW_STATUSES = [
  "new",
  "linked",
  "price_changed",
  "description_changed",
  "unlinked",
  "vat_rate_missing",
  "reviewed",
] as const;

export type SupplierPriceListRowStatus = (typeof SUPPLIER_PRICE_LIST_ROW_STATUSES)[number];

// `earlier` is what the supplier's earlier lists recorded for the row's item, null when none did.
export function supplierPriceListRowStatus(row: {
  reviewed: boolean;
  description: string;
  priceCents: number | null;
  link: { vatRate: number | null } | null;
  earlier: { description: string; priceCents: number } | null;
  requiresVatRate: boolean;
}): SupplierPriceListRowStatus {
  if (row.reviewed) {
    return "reviewed";
  }
  if (row.earlier === null) {
    return "new";
  }
  if (row.link === null) {
    return "unlinked";
  }
  if (row.priceCents !== row.earlier.priceCents) {
    return "price_changed";
  }
  if (row.description !== row.earlier.description) {
    return "description_changed";
  }
  return row.requiresVatRate && row.link.vatRate === null ? "vat_rate_missing" : "linked";
}

export function needsReview(status: SupplierPriceListRowStatus): boolean {
  return status !== "linked" && status !== "reviewed";
}

// Several rows of one list may print the same item; the list records it once, as its last row
// says, and `rows` keeps all of them in position order.
export function lastRowOfEachItem<T extends { code: string | null; description: string }>(
  rows: readonly T[],
): { key: SupplierItemKey; row: T; rows: T[] }[] {
  const byKey = new Map<string, { key: SupplierItemKey; row: T; rows: T[] }>();
  for (const row of rows) {
    const key = supplierItemKey(row);
    const mapKey = JSON.stringify([key.kind, key.value]);
    const existing = byKey.get(mapKey);
    if (existing) {
      existing.row = row;
      existing.rows.push(row);
    } else {
      byKey.set(mapKey, { key, row, rows: [row] });
    }
  }
  return [...byKey.values()];
}
