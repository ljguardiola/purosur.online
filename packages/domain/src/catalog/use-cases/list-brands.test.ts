import { describe, expect, it } from "vitest";
import { listBrands } from "./list-brands.js";
import { catalogProduct } from "./test-support/catalog-list-fixtures.js";
import { FakeCatalogListReader } from "./test-support/fake-catalog-list-reader.js";

const granix = { id: "brand-1", name: "Granix", active: true, version: 2 };
const litoral = { id: "brand-2", name: "Yerba del Litoral", active: false, version: 1 };

describe("listBrands", () => {
  it("lists the brands by name with their product counts", async () => {
    const reader = new FakeCatalogListReader({
      brands: [litoral, granix],
      products: [
        catalogProduct({ id: "product-1", brandId: granix.id }),
        catalogProduct({ id: "product-2", brandId: granix.id }),
      ],
    });

    expect(await listBrands({ catalog: reader })).toEqual([
      { ...granix, productCount: 2 },
      { ...litoral, productCount: 0 },
    ]);
  });

  it("does not count a deactivated product in its brand", async () => {
    const reader = new FakeCatalogListReader({
      brands: [granix],
      products: [
        catalogProduct({ id: "product-1", brandId: granix.id, active: true }),
        catalogProduct({ id: "product-2", brandId: granix.id, active: false }),
      ],
    });

    expect(await listBrands({ catalog: reader })).toEqual([{ ...granix, productCount: 1 }]);
  });
});
