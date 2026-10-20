import { describe, expect, it } from "vitest";
import { findBrandSummary } from "./find-brand-summary.js";
import { catalogProduct } from "./test-support/catalog-list-fixtures.js";
import { FakeCatalogListReader } from "./test-support/fake-catalog-list-reader.js";

const granvel = { id: "brand-1", name: "Granvel", active: true, version: 2 };

describe("findBrandSummary", () => {
  it("gives the brand with the count of its active products only", async () => {
    const reader = new FakeCatalogListReader({
      brands: [granvel],
      products: [
        catalogProduct({ id: "product-1", brandId: granvel.id, active: true }),
        catalogProduct({ id: "product-2", brandId: granvel.id, active: false }),
      ],
    });

    expect(await findBrandSummary({ catalog: reader }, granvel.id)).toEqual({
      ...granvel,
      productCount: 1,
    });
  });

  it("gives nothing for a brand that does not exist", async () => {
    const reader = new FakeCatalogListReader({ brands: [granvel] });

    expect(await findBrandSummary({ catalog: reader }, "brand-9")).toBeUndefined();
  });
});
