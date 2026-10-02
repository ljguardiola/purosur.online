import { describe, expect, it } from "vitest";
import { findBrandSummary } from "./find-brand-summary.js";
import { catalogProduct } from "./test-support/catalog-list-fixtures.js";
import { FakeCatalogListReader } from "./test-support/fake-catalog-list-reader.js";

const granix = { id: "brand-1", name: "Granix", active: true, version: 2 };

describe("findBrandSummary", () => {
  it("gives the brand with the count of its active products only", async () => {
    const reader = new FakeCatalogListReader({
      brands: [granix],
      products: [
        catalogProduct({ id: "product-1", brandId: granix.id, active: true }),
        catalogProduct({ id: "product-2", brandId: granix.id, active: false }),
      ],
    });

    expect(await findBrandSummary({ catalog: reader }, granix.id)).toEqual({
      ...granix,
      productCount: 1,
    });
  });

  it("gives nothing for a brand that does not exist", async () => {
    const reader = new FakeCatalogListReader({ brands: [granix] });

    expect(await findBrandSummary({ catalog: reader }, "brand-9")).toBeUndefined();
  });
});
