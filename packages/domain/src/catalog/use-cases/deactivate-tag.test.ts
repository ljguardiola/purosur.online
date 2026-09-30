import { describe, expect, it } from "vitest";
import { deactivateTag } from "./deactivate-tag.js";
import { FakeCatalogStore } from "./test-support/fake-catalog-store.js";

describe("deactivateTag", () => {
  it("answers not_found for an id that doesn't exist", async () => {
    const store = new FakeCatalogStore();

    const outcome = await deactivateTag(store, "missing");

    expect(outcome).toEqual({ kind: "not_found" });
  });

  it("answers already_inactive for a tag that is already inactive, changing nothing", async () => {
    const store = new FakeCatalogStore();
    store.seedTag({ id: "tag-1", name: "Sin TACC", active: false, version: 2 });

    const outcome = await deactivateTag(store, "tag-1");

    expect(outcome).toEqual({ kind: "already_inactive" });
    expect(store.snapshot().tags).toEqual([
      { id: "tag-1", name: "Sin TACC", active: false, version: 2 },
    ]);
  });

  it("deactivates the tag, bumping the version, and leaves the products that carry it with it", async () => {
    const store = new FakeCatalogStore();
    store.seedTag({ id: "decoy", name: "Decoy", active: true, version: 9 });
    store.seedTag({ id: "tag-1", name: "Sin TACC", active: true, version: 3 });
    store.seedProduct(
      {
        id: "product-1",
        name: "Galletitas",
        categoryId: "category-1",
        brandId: null,
        saleUnit: "UNIT",
        netContent: null,
        active: true,
        version: 1,
      },
      [{ code: "111" }],
      ["tag-1"],
    );
    const productsBefore = store.snapshot().products;

    const outcome = await deactivateTag(store, "tag-1");

    expect(outcome).toEqual({ kind: "deactivated" });
    expect(store.snapshot().tags).toEqual([
      { id: "decoy", name: "Decoy", active: true, version: 9 },
      { id: "tag-1", name: "Sin TACC", active: false, version: 4 },
    ]);
    expect(store.snapshot().products).toEqual(productsBefore);
    expect(store.snapshot().productTags).toEqual([{ productId: "product-1", tagId: "tag-1" }]);
    expect(store.lockCallOrder).toEqual(["lockTag"]);
  });

  it("runs entirely inside one transaction", async () => {
    const store = new FakeCatalogStore();
    store.seedTag({ id: "tag-1", name: "Sin TACC", active: true, version: 1 });

    await deactivateTag(store, "tag-1");

    expect(store.transactionCount).toBe(1);
  });
});
