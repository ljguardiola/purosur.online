import { SUPPLIER_PRICE_LIST_WEB_PAGE_ADDRESS_MAX_LENGTH } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { supplierPriceListWebPageBodySchema } from "./supplier-price-list-web-page-body.js";

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

  it("says the length when the address is blank", () => {
    expect(body("").error?.issues[0]?.message).toBe(
      `url must be a non-empty string of at most ${SUPPLIER_PRICE_LIST_WEB_PAGE_ADDRESS_MAX_LENGTH} characters`,
    );
  });
});
