import { describe, expect, it } from "vitest";
import { supplierPriceListRowLinkBodySchema } from "./supplier-price-list-row-link.js";

const body = { version: 3, productId: "product-1", packagingId: "packaging-1", vatRate: 2100 };

describe("supplierPriceListRowLinkBodySchema", () => {
  it("reads the version loaded, the product, its packaging and the rate", () => {
    expect(supplierPriceListRowLinkBodySchema.safeParse(body).data).toEqual(body);
  });

  it.each([2100, 1050, null])("accepts the rate %j", (vatRate) => {
    expect(supplierPriceListRowLinkBodySchema.safeParse({ ...body, vatRate }).data?.vatRate).toBe(
      vatRate,
    );
  });

  it("reads a missing rate as none", () => {
    const { vatRate: _vatRate, ...withoutRate } = body;

    expect(supplierPriceListRowLinkBodySchema.safeParse(withoutRate).data?.vatRate).toBeNull();
  });

  it.each([21, 10.5, 0, 1234, "2100", true])("refuses the rate %j", (vatRate) => {
    const result = supplierPriceListRowLinkBodySchema.safeParse({ ...body, vatRate });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["vatRate"]);
  });

  it.each(["productId", "packagingId"])("requires %s to be an id", (field) => {
    for (const value of [undefined, "", "  ", 5, null]) {
      const result = supplierPriceListRowLinkBodySchema.safeParse({ ...body, [field]: value });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual([field]);
    }
  });

  it.each([undefined, 0, -1, 1.5, "1", null])("rejects the version %j", (version) => {
    const result = supplierPriceListRowLinkBodySchema.safeParse({ ...body, version });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["version"]);
  });

  it("strips keys it does not know", () => {
    expect(supplierPriceListRowLinkBodySchema.safeParse({ ...body, listId: "x" }).data).toEqual(
      body,
    );
  });
});
