import { describe, expect, it } from "vitest";
import { supplierPriceListRowReviewBodySchema } from "./supplier-price-list-row-review.js";

describe("supplierPriceListRowReviewBodySchema", () => {
  it("reads the version loaded", () => {
    expect(supplierPriceListRowReviewBodySchema.safeParse({ version: 2 }).data).toEqual({
      version: 2,
    });
  });

  it.each([undefined, 0, -1, 1.5, "1", null])("rejects the version %j", (version) => {
    const result = supplierPriceListRowReviewBodySchema.safeParse({ version });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["version"]);
  });

  it("strips keys it does not know", () => {
    expect(
      supplierPriceListRowReviewBodySchema.safeParse({ version: 1, reviewed: false }).data,
    ).toEqual({ version: 1 });
  });
});
