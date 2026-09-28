import { describe, expect, it, vi } from "vitest";
import { createCategory } from "./create-category.js";
import { FakeCatalogStore } from "./test-support/fake-catalog-store.js";

describe("createCategory", () => {
  it("creates a top-level category at version 1", async () => {
    const store = new FakeCatalogStore();

    const outcome = await createCategory(store, { name: "Almacén", parentId: null });

    expect(outcome).toEqual({
      kind: "created",
      category: { id: "category-1", name: "Almacén", parentId: null, version: 1 },
    });
  });

  it("creates a subcategory under an existing leaf parent", async () => {
    const store = new FakeCatalogStore();
    store.seedCategory({ id: "busy", name: "Bebidas", parentId: null, version: 1 });
    store.seedProduct(
      {
        id: "product-9",
        name: "Agua",
        categoryId: "busy",
        saleUnit: "UNIT",
        netContent: null,
        active: true,
        version: 1,
      },
      [{ code: "900" }],
    );
    store.seedCategory({ id: "parent", name: "Almacén", parentId: null, version: 1 });

    const outcome = await createCategory(store, { name: "Yerbas", parentId: "parent" });

    expect(outcome).toEqual({
      kind: "created",
      category: { id: "category-1", name: "Yerbas", parentId: "parent", version: 1 },
    });
    expect(store.lockCallOrder).toEqual(["lockParentForNewChild"]);
  });

  it("gives each created category its own id", async () => {
    const store = new FakeCatalogStore();

    const first = await createCategory(store, { name: "Almacén", parentId: null });
    const second = await createCategory(store, { name: "Bebidas", parentId: null });

    expect(
      [first, second].map((outcome) => outcome.kind === "created" && outcome.category.id),
    ).toEqual(["category-1", "category-2"]);
    expect(store.snapshot().categories).toEqual([
      { id: "category-1", name: "Almacén", parentId: null, version: 1 },
      { id: "category-2", name: "Bebidas", parentId: null, version: 1 },
    ]);
  });

  it("lets an error that is not a name conflict through", async () => {
    const store = new FakeCatalogStore();
    vi.spyOn(store, "transaction").mockRejectedValue(new Error("connection lost"));

    await expect(createCategory(store, { name: "Almacén", parentId: null })).rejects.toThrow(
      "connection lost",
    );
  });

  it("rejects a parentId that does not exist", async () => {
    const store = new FakeCatalogStore();

    const outcome = await createCategory(store, { name: "Yerbas", parentId: "missing" });

    expect(outcome).toEqual({ kind: "parent_not_found" });
  });

  it("rejects a parentId that already has products assigned", async () => {
    const store = new FakeCatalogStore();
    store.seedCategory({ id: "parent", name: "Almacén", parentId: null, version: 1 });
    store.seedProduct(
      {
        id: "product-1",
        name: "Yerba",
        categoryId: "parent",
        saleUnit: "UNIT",
        netContent: null,
        active: false,
        version: 1,
      },
      [{ code: "111", active: false }],
    );

    const outcome = await createCategory(store, { name: "Yerbas", parentId: "parent" });

    expect(outcome).toEqual({ kind: "parent_has_products" });
  });

  it("rejects a name already used by a sibling, case-insensitively", async () => {
    const store = new FakeCatalogStore();
    store.seedCategory({ id: "existing", name: "Almacén", parentId: null, version: 1 });

    const outcome = await createCategory(store, { name: "ALMACÉN", parentId: null });

    expect(outcome).toEqual({ kind: "name_taken" });
  });

  it("allows the same name under a different parent", async () => {
    const store = new FakeCatalogStore();
    store.seedCategory({ id: "parent-a", name: "Top A", parentId: null, version: 1 });
    store.seedCategory({ id: "parent-b", name: "Top B", parentId: null, version: 1 });
    store.seedCategory({ id: "existing", name: "Yerbas", parentId: "parent-a", version: 1 });

    const outcome = await createCategory(store, { name: "Yerbas", parentId: "parent-b" });

    expect(outcome.kind).toBe("created");
  });

  it("maps a name race caught by the store's insert to name_taken", async () => {
    const store = new FakeCatalogStore();
    store.categoryNameConflicts.add("almacén");

    const outcome = await createCategory(store, { name: "Almacén", parentId: null });

    expect(outcome).toEqual({ kind: "name_taken" });
  });

  it("runs entirely inside one transaction", async () => {
    const store = new FakeCatalogStore();

    await createCategory(store, { name: "Almacén", parentId: null });

    expect(store.transactionCount).toBe(1);
  });
});
