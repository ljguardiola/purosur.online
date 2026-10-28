import { type Fraction, foldedText } from "../../shared/index.js";
import { STOCK_QUANTITY_PER_UNIT } from "../../stock/index.js";

export interface SupplierItemKey {
  kind: "code" | "description";
  value: string;
}

export function normalizeSupplierItemDescription(description: string): string {
  return foldedText(description).replace(/\s+/gu, " ").trim();
}

// A normalized text holds no line break, so the one joining the description and the presentation
// keeps every pair, and every description alone, apart.
function descriptionKeyValue(description: string, presentation: string | null): string {
  const normalizedDescription = normalizeSupplierItemDescription(description);
  const normalizedPresentation = normalizeSupplierItemDescription(presentation ?? "");
  return normalizedPresentation === ""
    ? normalizedDescription
    : `${normalizedDescription}\n${normalizedPresentation}`;
}

export function supplierItemKey(item: {
  code: string | null;
  description: string;
  presentation: string | null;
}): SupplierItemKey {
  const code = item.code?.trim() ?? "";
  return code === ""
    ? { kind: "description", value: descriptionKeyValue(item.description, item.presentation) }
    : { kind: "code", value: code };
}

export function sameSupplierItemKey(a: SupplierItemKey, b: SupplierItemKey): boolean {
  return a.kind === b.kind && a.value === b.value;
}

// The item's description follows its current price: the latest list by date, a tie going to the
// list confirmed later, which is the one being confirmed now.
export function supersedesCurrentPrice(listDate: string, currentListDate: string | null): boolean {
  return currentListDate === null || listDate >= currentListDate;
}

export interface PriceDating {
  listDate: string;
  confirmedAt: Date;
}

// A price came before a list when its list is dated earlier, or the same day and was confirmed
// before it; a list not confirmed yet comes after every confirmed one of its date, and a list with
// no date yet after every confirmed one.
export function isEarlierPrice(
  price: PriceDating,
  list: { listDate: string | null; confirmedAt: Date | null },
): boolean {
  if (list.listDate === null || price.listDate < list.listDate) {
    return true;
  }
  return (
    price.listDate === list.listDate &&
    (list.confirmedAt === null || price.confirmedAt.getTime() < list.confirmedAt.getTime())
  );
}

export function latestEarlierPrice<T extends PriceDating>(
  prices: readonly T[],
  list: { listDate: string | null; confirmedAt: Date | null },
): T | undefined {
  let latest: T | undefined;
  for (const price of prices) {
    if (isEarlierPrice(price, list) && (latest === undefined || isEarlierPrice(latest, price))) {
      latest = price;
    }
  }
  return latest;
}

// A link made in a list whose prices include VAT carries no rate, and keeps the one the item
// remembers for its lists that exclude it.
export function keepingRememberedVatRate<T extends { vatRate: number | null }>(
  link: T,
  remembered: { vatRate: number | null } | null,
): T {
  return link.vatRate === null && remembered !== null
    ? { ...link, vatRate: remembered.vatRate }
    : link;
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

export const SUPPLIER_OFFER_UNPRICED_REASONS = [
  "vat_rate_missing",
  "packaging_not_buyable",
] as const;

export type SupplierOfferUnpricedReason = (typeof SUPPLIER_OFFER_UNPRICED_REASONS)[number];

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

// `remembered` tells whether another of the supplier's lists recorded the row's item; `earlier` is
// what the latest of them dated before this list recorded, null when none is.
export function supplierPriceListRowStatus(row: {
  reviewed: boolean;
  description: string;
  priceCents: number | null;
  link: { vatRate: number | null } | null;
  remembered: boolean;
  earlier: { description: string; priceCents: number } | null;
  requiresVatRate: boolean;
}): SupplierPriceListRowStatus {
  if (row.reviewed) {
    return "reviewed";
  }
  if (!row.remembered) {
    return "new";
  }
  if (row.link === null) {
    return "unlinked";
  }
  if (row.earlier !== null && row.priceCents !== row.earlier.priceCents) {
    return "price_changed";
  }
  if (row.earlier !== null && row.description !== row.earlier.description) {
    return "description_changed";
  }
  return row.requiresVatRate && row.link.vatRate === null ? "vat_rate_missing" : "linked";
}

export function needsReview(status: SupplierPriceListRowStatus): boolean {
  return status !== "linked" && status !== "reviewed";
}

// Several rows of one list may print the same item; the list records it once, as its last row
// says, and `rows` keeps all of them in position order.
export function lastRowOfEachItem<
  T extends { code: string | null; description: string; presentation: string | null },
>(rows: readonly T[]): { key: SupplierItemKey; row: T; rows: T[] }[] {
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
