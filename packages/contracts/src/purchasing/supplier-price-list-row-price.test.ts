import { MAX_CASH_AMOUNT_CENTS } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { supplierPriceListRowPriceBodySchema } from "./supplier-price-list-row-price.js";

describe("supplierPriceListRowPriceBodySchema", () => {
  it("reads the price in cents and the version loaded", () => {
    expect(
      supplierPriceListRowPriceBodySchema.safeParse({ priceCents: 150_050, version: 2 }).data,
    ).toEqual({ priceCents: 150_050, version: 2 });
  });

  it.each([0, MAX_CASH_AMOUNT_CENTS])("accepts %s cents", (priceCents) => {
    expect(supplierPriceListRowPriceBodySchema.safeParse({ priceCents, version: 1 }).success).toBe(
      true,
    );
  });

  it.each([undefined, null, -1, 0.5, "100", MAX_CASH_AMOUNT_CENTS + 1])(
    "rejects the price %j",
    (priceCents) => {
      const result = supplierPriceListRowPriceBodySchema.safeParse({ priceCents, version: 1 });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(["priceCents"]);
    },
  );

  it.each([undefined, 0, -1, 1.5, "1", null])("rejects the version %j", (version) => {
    const result = supplierPriceListRowPriceBodySchema.safeParse({ priceCents: 100, version });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["version"]);
  });

  it("strips keys it does not know", () => {
    expect(
      supplierPriceListRowPriceBodySchema.safeParse({
        priceCents: 100,
        version: 1,
        description: "otra cosa",
      }).data,
    ).toEqual({ priceCents: 100, version: 1 });
  });
});
