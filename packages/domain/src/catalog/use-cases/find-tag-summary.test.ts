import { describe, expect, it } from "vitest";
import { findTagSummary } from "./find-tag-summary.js";
import { catalogProduct } from "./test-support/catalog-list-fixtures.js";
import { FakeCatalogListReader } from "./test-support/fake-catalog-list-reader.js";

const organic = { id: "tag-1", name: "Orgánico", active: true, version: 1 };

describe("findTagSummary", () => {
  it("gives the tag with the count of its active products only", async () => {
    const reader = new FakeCatalogListReader({
      tags: [organic],
      products: [
        catalogProduct({ id: "product-1", tagIds: [organic.id], active: true }),
        catalogProduct({ id: "product-2", tagIds: [organic.id], active: false }),
      ],
    });

    expect(await findTagSummary({ catalog: reader }, organic.id)).toEqual({
      ...organic,
      productCount: 1,
    });
  });

  it("gives nothing for a tag that does not exist", async () => {
    const reader = new FakeCatalogListReader({ tags: [organic] });

    expect(await findTagSummary({ catalog: reader }, "tag-9")).toBeUndefined();
  });
});
