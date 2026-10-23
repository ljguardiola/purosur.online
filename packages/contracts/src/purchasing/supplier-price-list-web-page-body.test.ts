import { SUPPLIER_PRICE_LIST_WEB_PAGE_ADDRESS_MAX_LENGTH } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import {
  supplierPriceListWebPageAddressSchema,
  supplierPriceListWebPageBodySchema,
} from "./supplier-price-list-web-page-body.js";

const SUPPLIER_ID = "11111111-1111-4111-8111-111111111111";
const URL = "https://distribuidora-sur.example/lista";

function body(url: unknown) {
  return supplierPriceListWebPageBodySchema.safeParse({ supplierId: SUPPLIER_ID, url });
}

describe("supplierPriceListWebPageBodySchema", () => {
  it("reads the supplier and the trimmed address", () => {
    expect(body(`  ${URL} `).data).toEqual({ supplierId: SUPPLIER_ID, url: URL });
  });

  it.each([
    "http://distribuidora-sur.example/lista",
    "HTTPS://distribuidora-sur.example/lista",
    "https://distribuidora-sur.example:8443/lista?pagina=2#precios",
    "https://203.0.113.9/lista",
  ])("accepts the address %s", (url) => {
    expect(body(url).success).toBe(true);
  });

  it.each([
    "ftp://distribuidora-sur.example/lista",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "distribuidora-sur.example/lista",
    "https://",
    "not an address",
    "",
    "   ",
    null,
    undefined,
    42,
  ])("refuses the address %j", (url) => {
    expect(body(url).success).toBe(false);
  });

  it("refuses a supplier that is not a record id", () => {
    expect(
      supplierPriceListWebPageBodySchema.safeParse({ supplierId: "x", url: URL }).success,
    ).toBe(false);
  });

  it("accepts an address of the maximum length and refuses a longer one", () => {
    const prefix = "https://distribuidora-sur.example/";
    const ofLength = (length: number) => `${prefix}${"a".repeat(length - prefix.length)}`;

    expect(body(ofLength(SUPPLIER_PRICE_LIST_WEB_PAGE_ADDRESS_MAX_LENGTH)).success).toBe(true);
    expect(body(ofLength(SUPPLIER_PRICE_LIST_WEB_PAGE_ADDRESS_MAX_LENGTH + 1)).success).toBe(false);
  });

  it("says which part of the body it refuses", () => {
    const refused = supplierPriceListWebPageBodySchema.safeParse({
      supplierId: "x",
      url: "ftp://distribuidora-sur.example/lista",
    });

    expect(refused.error?.issues.map((issue) => [issue.path, issue.message])).toEqual([
      [["supplierId"], "supplierId must be a supplier's id"],
      [["url"], "url must be a web address starting with http:// or https://"],
    ]);
  });

  it("says both the length and the web address when the address is blank", () => {
    expect(body("").error?.issues.map((issue) => issue.message)).toEqual([
      `url must be a non-empty string of at most ${SUPPLIER_PRICE_LIST_WEB_PAGE_ADDRESS_MAX_LENGTH} characters`,
      "url must be a web address starting with http:// or https://",
    ]);
  });
});

describe("supplierPriceListWebPageAddressSchema", () => {
  it("accepts a web address of any length, trimmed", () => {
    const long = `https://distribuidora-sur.example/${"a".repeat(SUPPLIER_PRICE_LIST_WEB_PAGE_ADDRESS_MAX_LENGTH)}`;

    expect(supplierPriceListWebPageAddressSchema.safeParse(` ${long} `).data).toBe(long);
  });

  it.each(["ftp://distribuidora-sur.example/lista", "distribuidora-sur.example/lista", "", 42])(
    "refuses %j, which is not a web address",
    (url) => {
      expect(
        supplierPriceListWebPageAddressSchema
          .safeParse(url)
          .error?.issues.map((issue) => issue.message),
      ).toEqual(["url must be a web address starting with http:// or https://"]);
    },
  );
});
