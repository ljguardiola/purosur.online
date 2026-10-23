import { codePointLength } from "../../shared/index.js";

export const SUPPLIER_PRICE_LIST_WEB_PAGE_MAX_REDIRECTS = 3;

export const SUPPLIER_PRICE_LIST_WEB_PAGE_MAX_BYTES = 10 * 1024 * 1024;

export const SUPPLIER_PRICE_LIST_WEB_PAGE_TIME_LIMIT_MS = 30_000;

export const SUPPLIER_PRICE_LIST_WEB_PAGE_ADDRESS_MAX_LENGTH = 2048;

export const SUPPLIER_PRICE_LIST_WEB_PAGE_SCHEMES = ["http", "https"] as const;

export const SUPPLIER_PRICE_LIST_WEB_PAGE_REFUSALS = [
  "invalid_address",
  "address_not_public",
  "too_many_redirects",
  "too_large",
  "too_slow",
  "unsupported_content",
  "unreachable",
] as const;

export type SupplierPriceListWebPageRefusal =
  (typeof SUPPLIER_PRICE_LIST_WEB_PAGE_REFUSALS)[number];

export function isSupplierPriceListWebPageScheme(scheme: string): boolean {
  return (SUPPLIER_PRICE_LIST_WEB_PAGE_SCHEMES as readonly string[]).includes(scheme);
}

export function isSupplierPriceListWebPageAddressTooLong(address: string): boolean {
  return codePointLength(address) > SUPPLIER_PRICE_LIST_WEB_PAGE_ADDRESS_MAX_LENGTH;
}
