import { describe, expect, it } from "vitest";
import { supplierPriceListRowRemovalBodySchema } from "./supplier-price-list-row-removal.js";

describe("supplierPriceListRowRemovalBodySchema", () => {
  it("reads the version loaded", () => {
    expect(supplierPriceListRowRemovalBodySchema.safeParse({ version: 3 }).data).toEqual({
      version: 3,
    });
  });

  it.each([undefined, 0, -1, 1.5, "1", null])("rejects the version %j", (version) => {
    expect(supplierPriceListRowRemovalBodySchema.safeParse({ version }).success).toBe(false);
  });

  it("strips keys it does not know", () => {
    expect(
      supplierPriceListRowRemovalBodySchema.safeParse({ version: 1, rowId: "x" }).data,
    ).toEqual({ version: 1 });
  });
});
