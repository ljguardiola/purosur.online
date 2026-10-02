import { describe, expect, it, vi } from "vitest";
import { editCategory } from "./edit-category.js";
import { FakeCatalogStore } from "./test-support/fake-catalog-store.js";

describe("editCategory", () => {
  it("answers not_found for a category that is missing when it is locked, changing nothing", async () => {
    const store = new FakeCatalogStore();
    store.seedCategory({ id: "decoy", name: "Decoy", parentId: null, version: 1 });

    const outcome = await editCategory(store, {
      id: "missing",
      name: "Almacén",
      parentId: null,
      version: 1,
    });

    expect(outcome).toEqual({ kind: "not_found" });
    expect(store.snapshot().categories).toEqual([
      { id: "decoy", name: "Decoy", parentId: null, version: 1 },
    ]);
  });

  it("answers not_found for a category that is missing when a move to a parent is attempted, changing nothing", async () => {
    const store = new FakeCatalogStore();
    store.seedCategory({ id: "parent-1", name: "Jardín", parentId: null, version: 1 });

    const outcome = await editCategory(store, {
      id: "missing",
      name: "Almacén",
      parentId: "parent-1",
      version: 1,
    });

    expect(outcome).toEqual({ kind: "not_found" });
    expect(store.lockCallOrder).toEqual(["lockCategoryTreeForMove", "lockCategory"]);
    expect(store.snapshot().categories).toEqual([
      { id: "parent-1", name: "Jardín", parentId: null, version: 1 },
    ]);
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
    expect(store.lockCallOrder).toEqual(["lockCategoryTreeForMove", "lockCategory"]);
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
    expect(store.lockCallOrder).toEqual(["lockCategory"]);
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
        brandId: null,
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

  it("rejects moving a category under its own child when asked for it in another letter case, changing nothing", async () => {
    const store = new FakeCatalogStore();
    store.seedCategory({ id: "top", name: "Top", parentId: null, version: 1 });
    store.seedCategory({ id: "child", name: "Child", parentId: "top", version: 1 });

    const outcome = await editCategory(store, {
      id: "TOP",
      name: "Top",
      parentId: "child",
      version: 1,
    });

    expect(outcome).toEqual({ kind: "move_not_allowed" });
    expect(store.snapshot().categories).toEqual([
      { id: "top", name: "Top", parentId: null, version: 1 },
      { id: "child", name: "Child", parentId: "top", version: 1 },
    ]);
  });

  it("answers with the category's id as the store holds it when asked for it in another letter case", async () => {
    const store = new FakeCatalogStore();
    store.seedCategory({ id: "category-1", name: "Almacén", parentId: null, version: 1 });

    const renamed = await editCategory(store, {
      id: "CATEGORY-1",
      name: "Despensa",
      parentId: null,
      version: 1,
    });
    const unchanged = await editCategory(store, {
      id: "CATEGORY-1",
      name: "Despensa",
      parentId: null,
      version: 2,
    });

    expect(renamed).toEqual({
      kind: "applied",
      category: { id: "category-1", name: "Despensa", parentId: null, version: 2 },
    });
    expect(unchanged).toEqual({
      kind: "applied",
      category: { id: "category-1", name: "Despensa", parentId: null, version: 2 },
    });
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
      "lockCategory",
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

    expect(store.lockCallOrder).toEqual(["lockCategory"]);
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
