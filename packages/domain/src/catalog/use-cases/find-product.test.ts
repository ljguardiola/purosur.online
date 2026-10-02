import { describe, expect, it } from "vitest";
import { findProduct } from "./find-product.js";
import { catalogProduct } from "./test-support/catalog-list-fixtures.js";
import { FakeCatalogListReader } from "./test-support/fake-catalog-list-reader.js";

describe("findProduct", () => {
  it("gives the product, deactivated or not", async () => {
    const retired = catalogProduct({ id: "product-2", active: false });
    const reader = new FakeCatalogListReader({
      products: [catalogProduct({ id: "product-1" }), retired],
    });

    expect(await findProduct({ catalog: reader }, retired.id)).toEqual(retired);
  });

  it("gives nothing for a product that does not exist", async () => {
    const reader = new FakeCatalogListReader({ products: [catalogProduct()] });

    expect(await findProduct({ catalog: reader }, "product-9")).toBeUndefined();
  });
});
