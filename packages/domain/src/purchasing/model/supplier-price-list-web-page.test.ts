import { describe, expect, it } from "vitest";
import {
  isSupplierPriceListWebPageAddressTooLong,
  isSupplierPriceListWebPageScheme,
  SUPPLIER_PRICE_LIST_WEB_PAGE_ADDRESS_MAX_LENGTH,
  SUPPLIER_PRICE_LIST_WEB_PAGE_MAX_BYTES,
  SUPPLIER_PRICE_LIST_WEB_PAGE_MAX_REDIRECTS,
  SUPPLIER_PRICE_LIST_WEB_PAGE_REFUSALS,
  SUPPLIER_PRICE_LIST_WEB_PAGE_SCHEMES,
  SUPPLIER_PRICE_LIST_WEB_PAGE_TIME_LIMIT_MS,
} from "./supplier-price-list-web-page.js";

describe("supplier price list web page limits", () => {
  it("follows at most 3 redirects, takes at most 10 MB and gives the page 30 seconds", () => {
    expect(SUPPLIER_PRICE_LIST_WEB_PAGE_MAX_REDIRECTS).toBe(3);
    expect(SUPPLIER_PRICE_LIST_WEB_PAGE_MAX_BYTES).toBe(10 * 1024 * 1024);
    expect(SUPPLIER_PRICE_LIST_WEB_PAGE_TIME_LIMIT_MS).toBe(30_000);
  });

  it("names the schemes and the reasons a page is refused", () => {
    expect(SUPPLIER_PRICE_LIST_WEB_PAGE_SCHEMES).toEqual(["http", "https"]);
    expect(SUPPLIER_PRICE_LIST_WEB_PAGE_REFUSALS).toEqual([
      "invalid_address",
      "address_not_public",
      "too_many_redirects",
      "too_large",
      "too_slow",
      "unsupported_content",
      "store_catalog_unavailable",
      "unreachable",
    ]);
  });
});

describe("isSupplierPriceListWebPageScheme", () => {
  it.each(["http", "https"])("accepts %s", (scheme) => {
    expect(isSupplierPriceListWebPageScheme(scheme)).toBe(true);
  });

  it.each(["ftp", "file", "javascript", "HTTP", "https:", ""])("refuses %j", (scheme) => {
    expect(isSupplierPriceListWebPageScheme(scheme)).toBe(false);
  });
});

describe("isSupplierPriceListWebPageAddressTooLong", () => {
  it("allows an address of 2048 characters and refuses one more", () => {
    expect(SUPPLIER_PRICE_LIST_WEB_PAGE_ADDRESS_MAX_LENGTH).toBe(2048);
    expect(isSupplierPriceListWebPageAddressTooLong("a".repeat(2048))).toBe(false);
    expect(isSupplierPriceListWebPageAddressTooLong("a".repeat(2049))).toBe(true);
  });

  it("counts characters, not UTF-16 units", () => {
    expect(isSupplierPriceListWebPageAddressTooLong("🐟".repeat(2048))).toBe(false);
    expect(isSupplierPriceListWebPageAddressTooLong("🐟".repeat(2049))).toBe(true);
  });
});
