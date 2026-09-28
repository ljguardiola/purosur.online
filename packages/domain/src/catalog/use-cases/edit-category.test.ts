import { describe, expect, it, vi } from "vitest";
import { editCategory } from "./edit-category.js";
import { FakeCatalogStore } from "./test-support/fake-catalog-store.js";

describe("editCategory", () => {
  it("answers stale_version for a row that is missing when it is locked", async () => {
    const store = new FakeCatalogStore();
    store.seedCategory({ id: "decoy", name: "Decoy", parentId: null, version: 1 });

    const outcome = await editCategory(store, {
      id: "missing",
      name: "Almacén",
      parentId: null,
      version: 1,
    });

    expect(outcome).toEqual({ kind: "stale_version" });
  });

  it("rejects a stale version", async () => {
    const store = new FakeCatalogStore();
    store.seedCategory({ id: "category-1", name: "Almacén", parentId: null, version: 2 });

    const outcome = await editCategory(store, {
      id: "category-1",
      name: "Almacén Renombrado",
      parentId: null,
      version: 1,
    });

    expect(outcome).toEqual({ kind: "stale_version" });
  });

  it("allows keeping a category's own name and parent unchanged, as a no-op that does not bump the version", async () => {
    const store = new FakeCatalogStore();
    store.seedCategory({ id: "category-1", name: "Almacén", parentId: null, version: 1 });

    const outcome = await editCategory(store, {
      id: "category-1",
      name: "Almacén",
      parentId: null,
      version: 1,
    });

    expect(outcome).toEqual({
      kind: "applied",
      category: { id: "category-1", name: "Almacén", parentId: null, version: 1 },
    });
  });

  it("allows keeping a subcategory's own parent unchanged, as a no-op that locks the tree but does not bump the version", async () => {
    const store = new FakeCatalogStore();
    store.seedCategory({ id: "parent", name: "Almacén", parentId: null, version: 1 });
    store.seedCategory({ id: "category-1", name: "Untables", parentId: "parent", version: 1 });

    const outcome = await editCategory(store, {
      id: "category-1",
      name: "Untables",
      parentId: "parent",
      version: 1,
    });

    expect(outcome).toEqual({
      kind: "applied",
      category: { id: "category-1", name: "Untables", parentId: "parent", version: 1 },
    });
    expect(store.lockCallOrder).toEqual(["lockCategoryTreeForMove", "lockCategoryForUpdate"]);
    expect(store.snapshot().categories).toContainEqual({
      id: "category-1",
      name: "Untables",
      parentId: "parent",
      version: 1,
    });
  });

  it("renames the category, bumping the version", async () => {
    const store = new FakeCatalogStore();
    store.seedCategory({ id: "decoy", name: "Decoy", parentId: null, version: 5 });
    store.seedCategory({ id: "category-1", name: "Almacén", parentId: null, version: 1 });

    const outcome = await editCategory(store, {
      id: "category-1",
      name: "Almacén General",
      parentId: null,
      version: 1,
    });

    expect(outcome).toEqual({
      kind: "applied",
      category: { id: "category-1", name: "Almacén General", parentId: null, version: 2 },
    });
    expect(store.snapshot().categories).toEqual([
      { id: "decoy", name: "Decoy", parentId: null, version: 5 },
      { id: "category-1", name: "Almacén General", parentId: null, version: 2 },
    ]);
    expect(store.lockCallOrder).toEqual(["lockCategoryForUpdate"]);
  });

  it("lets a category change only the case of its own name", async () => {
    const store = new FakeCatalogStore();
    store.seedCategory({ id: "category-1", name: "yerbas", parentId: null, version: 1 });

    const outcome = await editCategory(store, {
      id: "category-1",
      name: "Yerbas",
      parentId: null,
      version: 1,
    });

    expect(outcome.kind).toBe("applied");
  });

  it("lets an error that is not a name conflict through", async () => {
    const store = new FakeCatalogStore();
    vi.spyOn(store, "transaction").mockRejectedValue(new Error("connection lost"));

    await expect(
      editCategory(store, { id: "category-1", name: "Almacén", parentId: null, version: 1 }),
    ).rejects.toThrow("connection lost");
  });

  it("moves the category under a new parent", async () => {
    const store = new FakeCatalogStore();
    store.seedCategory({ id: "old-parent", name: "Old", parentId: null, version: 1 });
    store.seedCategory({ id: "new-parent", name: "New", parentId: null, version: 1 });
    store.seedCategory({ id: "category-1", name: "Yerbas", parentId: "old-parent", version: 1 });

    const outcome = await editCategory(store, {
      id: "category-1",
      name: "Yerbas",
      parentId: "new-parent",
      version: 1,
    });

    expect(outcome).toEqual({
      kind: "applied",
      category: { id: "category-1", name: "Yerbas", parentId: "new-parent", version: 2 },
    });
  });

  it("moves the category to top level", async () => {
    const store = new FakeCatalogStore();
    store.seedCategory({ id: "old-parent", name: "Old", parentId: null, version: 1 });
    store.seedCategory({ id: "category-1", name: "Yerbas", parentId: "old-parent", version: 1 });

    const outcome = await editCategory(store, {
      id: "category-1",
      name: "Yerbas",
      parentId: null,
      version: 1,
    });

    expect(outcome).toEqual({
      kind: "applied",
      category: { id: "category-1", name: "Yerbas", parentId: null, version: 2 },
    });
  });

  it("rejects a new parentId that does not exist", async () => {
    const store = new FakeCatalogStore();
    store.seedCategory({ id: "category-1", name: "Yerbas", parentId: null, version: 1 });

    const outcome = await editCategory(store, {
      id: "category-1",
      name: "Yerbas",
      parentId: "missing",
      version: 1,
    });

    expect(outcome).toEqual({ kind: "parent_not_found" });
  });

  it("rejects a new parent that already has products assigned", async () => {
    const store = new FakeCatalogStore();
    store.seedCategory({ id: "new-parent", name: "New", parentId: null, version: 1 });
    store.seedProduct(
      {
        id: "product-1",
        name: "Yerba",
        categoryId: "new-parent",
        saleUnit: "UNIT",
        netContent: null,
        active: true,
        version: 1,
      },
      [{ code: "111" }],
    );
    store.seedCategory({ id: "category-1", name: "Yerbas", parentId: null, version: 1 });

    const outcome = await editCategory(store, {
      id: "category-1",
      name: "Yerbas",
      parentId: "new-parent",
      version: 1,
    });

    expect(outcome).toEqual({ kind: "parent_has_products" });
  });

  it("rejects moving a category under itself", async () => {
    const store = new FakeCatalogStore();
    store.seedCategory({ id: "category-1", name: "Yerbas", parentId: null, version: 1 });

    const outcome = await editCategory(store, {
      id: "category-1",
      name: "Yerbas",
      parentId: "category-1",
      version: 1,
    });

    expect(outcome).toEqual({ kind: "move_not_allowed" });
  });

  it("rejects moving a category under one of its own descendants", async () => {
    const store = new FakeCatalogStore();
    store.seedCategory({ id: "top", name: "Top", parentId: null, version: 1 });
    store.seedCategory({ id: "mid", name: "Mid", parentId: "top", version: 1 });
    store.seedCategory({ id: "leaf", name: "Leaf", parentId: "mid", version: 1 });

    const outcome = await editCategory(store, {
      id: "top",
      name: "Top",
      parentId: "leaf",
      version: 1,
    });

    expect(outcome).toEqual({ kind: "move_not_allowed" });
  });

  it("rejects a name already used by a sibling under the destination parent", async () => {
    const store = new FakeCatalogStore();
    store.seedCategory({ id: "parent", name: "Parent", parentId: null, version: 1 });
    store.seedCategory({ id: "sibling", name: "Yerbas", parentId: "parent", version: 1 });
    store.seedCategory({ id: "category-1", name: "Cafés", parentId: null, version: 1 });

    const outcome = await editCategory(store, {
      id: "category-1",
      name: "Yerbas",
      parentId: "parent",
      version: 1,
    });

    expect(outcome).toEqual({ kind: "name_taken" });
  });

  it("maps a name race caught by the store's write to name_taken", async () => {
    const store = new FakeCatalogStore();
    store.seedCategory({ id: "category-1", name: "Almacén", parentId: null, version: 1 });
    store.categoryNameConflicts.add("bebidas");

    const outcome = await editCategory(store, {
      id: "category-1",
      name: "Bebidas",
      parentId: null,
      version: 1,
    });

    expect(outcome).toEqual({ kind: "name_taken" });
  });

  it("locks the category tree before locking the category row when moving it", async () => {
    const store = new FakeCatalogStore();
    store.seedCategory({ id: "new-parent", name: "New", parentId: null, version: 1 });
    store.seedCategory({ id: "category-1", name: "Yerbas", parentId: null, version: 1 });

    await editCategory(store, {
      id: "category-1",
      name: "Yerbas",
      parentId: "new-parent",
      version: 1,
    });

    expect(store.lockCallOrder).toEqual([
      "lockCategoryTreeForMove",
      "lockCategoryForUpdate",
      "lockParentForNewChild",
    ]);
  });

  it("does not lock the category tree for an edit that keeps the category at top level", async () => {
    const store = new FakeCatalogStore();
    store.seedCategory({ id: "category-1", name: "Yerbas", parentId: null, version: 1 });

    await editCategory(store, {
      id: "category-1",
      name: "Yerbas Renombradas",
      parentId: null,
      version: 1,
    });

    expect(store.lockCallOrder).toEqual(["lockCategoryForUpdate"]);
  });

  it("runs entirely inside one transaction", async () => {
    const store = new FakeCatalogStore();
    store.seedCategory({ id: "category-1", name: "Yerbas", parentId: null, version: 1 });

    await editCategory(store, {
      id: "category-1",
      name: "Yerbas Renombradas",
      parentId: null,
      version: 1,
    });

    expect(store.transactionCount).toBe(1);
  });
});
