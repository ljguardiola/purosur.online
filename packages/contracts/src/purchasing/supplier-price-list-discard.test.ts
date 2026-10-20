import { describe, expect, it } from "vitest";
import { supplierPriceListDiscardBodySchema } from "./supplier-price-list-discard.js";

describe("supplierPriceListDiscardBodySchema", () => {
  it("reads the version loaded", () => {
    expect(supplierPriceListDiscardBodySchema.safeParse({ version: 3 }).data).toEqual({
      version: 3,
    });
  });

  it.each([undefined, 0, -1, 1.5, "1", null])("rejects the version %j", (version) => {
    expect(supplierPriceListDiscardBodySchema.safeParse({ version }).success).toBe(false);
  });

  it("strips keys it does not know", () => {
    expect(
      supplierPriceListDiscardBodySchema.safeParse({ version: 1, state: "REVIEWED" }).data,
    ).toEqual({
      version: 1,
    });
  });
});
