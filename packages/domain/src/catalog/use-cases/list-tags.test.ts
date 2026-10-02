import { describe, expect, it } from "vitest";
import { listTags } from "./list-tags.js";
import { catalogProduct } from "./test-support/catalog-list-fixtures.js";
import { FakeCatalogListReader } from "./test-support/fake-catalog-list-reader.js";

const organic = { id: "tag-1", name: "Orgánico", active: true, version: 1 };
const vegan = { id: "tag-2", name: "Vegano", active: false, version: 3 };

describe("listTags", () => {
  it("lists the tags by name with their product counts", async () => {
    const reader = new FakeCatalogListReader({
      tags: [vegan, organic],
      products: [
        catalogProduct({ id: "product-1", tagIds: [organic.id, vegan.id] }),
        catalogProduct({ id: "product-2", tagIds: [organic.id] }),
      ],
    });

    const { tags } = await listTags({ catalog: reader });

    expect(tags).toEqual([
      { ...organic, productCount: 2 },
      { ...vegan, productCount: 1 },
    ]);
  });

  it("counts each tagged product once however many tags it has", async () => {
    const reader = new FakeCatalogListReader({
      tags: [organic, vegan],
      products: [
        catalogProduct({ id: "product-1", tagIds: [organic.id, vegan.id] }),
        catalogProduct({ id: "product-2", tagIds: [] }),
      ],
    });

    expect((await listTags({ catalog: reader })).taggedProductCount).toBe(1);
  });

  it("does not count a deactivated product in its tags or in the tagged total", async () => {
    const reader = new FakeCatalogListReader({
      tags: [organic],
      products: [
        catalogProduct({ id: "product-1", tagIds: [organic.id], active: true }),
        catalogProduct({ id: "product-2", tagIds: [organic.id], active: false }),
      ],
    });

    expect(await listTags({ catalog: reader })).toEqual({
      tags: [{ ...organic, productCount: 1 }],
      taggedProductCount: 1,
    });
  });
});
