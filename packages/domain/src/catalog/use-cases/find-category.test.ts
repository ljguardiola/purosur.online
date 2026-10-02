import { describe, expect, it } from "vitest";
import { findCategory } from "./find-category.js";
import { FakeCatalogListReader } from "./test-support/fake-catalog-list-reader.js";

const pantry = { id: "category-1", name: "Almacén", version: 3, parentId: null };

describe("findCategory", () => {
  it("gives the category", async () => {
    const reader = new FakeCatalogListReader({
      categories: [pantry, { id: "category-2", name: "Bebidas", version: 1, parentId: null }],
    });

    expect(await findCategory({ catalog: reader }, pantry.id)).toEqual(pantry);
  });

  it("gives nothing for a category that does not exist", async () => {
    const reader = new FakeCatalogListReader({ categories: [pantry] });

    expect(await findCategory({ catalog: reader }, "category-9")).toBeUndefined();
  });
});
