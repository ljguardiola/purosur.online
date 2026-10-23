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
