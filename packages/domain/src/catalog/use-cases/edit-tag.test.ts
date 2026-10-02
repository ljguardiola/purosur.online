import { describe, expect, it, vi } from "vitest";
import { editTag } from "./edit-tag.js";
import { FakeCatalogStore } from "./test-support/fake-catalog-store.js";

describe("editTag", () => {
  it("answers not_found for a tag that is missing when it is locked, changing nothing", async () => {
    const store = new FakeCatalogStore();
    store.seedTag({ id: "decoy", name: "Decoy", active: true, version: 1 });

    const outcome = await editTag(store, { id: "missing", name: "Sin TACC", version: 1 });

    expect(outcome).toEqual({ kind: "not_found" });
    expect(store.snapshot().tags).toEqual([
      { id: "decoy", name: "Decoy", active: true, version: 1 },
    ]);
  });

  it("rejects a stale version", async () => {
    const store = new FakeCatalogStore();
    store.seedTag({ id: "tag-1", name: "Sin TACC", active: true, version: 2 });

    const outcome = await editTag(store, { id: "tag-1", name: "Sin gluten", version: 1 });

    expect(outcome).toEqual({ kind: "stale_version" });
    expect(store.snapshot().tags).toEqual([
      { id: "tag-1", name: "Sin TACC", active: true, version: 2 },
    ]);
  });

  it("renames the tag, bumping the version and keeping its active state", async () => {
    const store = new FakeCatalogStore();
    store.seedTag({ id: "decoy", name: "Decoy", active: true, version: 5 });
    store.seedTag({ id: "tag-1", name: "Sin TACC", active: false, version: 3 });

    const outcome = await editTag(store, { id: "tag-1", name: "Sin gluten", version: 3 });

    expect(outcome).toEqual({
      kind: "applied",
      tag: { id: "tag-1", name: "Sin gluten", active: false, version: 4 },
    });
    expect(store.snapshot().tags).toEqual([
      { id: "decoy", name: "Decoy", active: true, version: 5 },
      { id: "tag-1", name: "Sin gluten", active: false, version: 4 },
    ]);
    expect(store.lockCallOrder).toEqual(["lockTag"]);
  });

  it("keeps an unchanged name as a no-op that does not bump the version", async () => {
    const store = new FakeCatalogStore();
    store.seedTag({ id: "tag-1", name: "Sin TACC", active: true, version: 3 });
    store.tagNameConflicts.add("sin tacc");

    const outcome = await editTag(store, { id: "tag-1", name: "Sin TACC", version: 3 });

    expect(outcome).toEqual({
      kind: "applied",
      tag: { id: "tag-1", name: "Sin TACC", active: true, version: 3 },
    });
    expect(store.snapshot().tags).toEqual([
      { id: "tag-1", name: "Sin TACC", active: true, version: 3 },
    ]);
  });

  it("lets a tag change only the case of its own name", async () => {
    const store = new FakeCatalogStore();
    store.seedTag({ id: "tag-1", name: "sin tacc", active: true, version: 1 });

    const outcome = await editTag(store, { id: "tag-1", name: "Sin TACC", version: 1 });

    expect(outcome).toEqual({
      kind: "applied",
      tag: { id: "tag-1", name: "Sin TACC", active: true, version: 2 },
    });
  });

  it("rejects a name another tag already has, ignoring letter case and whether it is active", async () => {
    const store = new FakeCatalogStore();
    store.seedTag({ id: "tag-1", name: "Sin TACC", active: true, version: 1 });
    store.seedTag({ id: "tag-2", name: "Vegano", active: false, version: 1 });

    const outcome = await editTag(store, { id: "tag-1", name: "VEGANO", version: 1 });

    expect(outcome).toEqual({ kind: "name_taken" });
    expect(store.snapshot().tags[0]).toEqual({
      id: "tag-1",
      name: "Sin TACC",
      active: true,
      version: 1,
    });
  });

  it("maps a name race caught by the store's write to name_taken", async () => {
    const store = new FakeCatalogStore();
    store.seedTag({ id: "tag-1", name: "Sin TACC", active: true, version: 1 });
    store.tagNameConflicts.add("vegano");

    const outcome = await editTag(store, { id: "tag-1", name: "Vegano", version: 1 });

    expect(outcome).toEqual({ kind: "name_taken" });
    expect(store.snapshot().tags[0]?.name).toBe("Sin TACC");
  });

  it("lets an error that is not a name conflict through", async () => {
    const store = new FakeCatalogStore();
    vi.spyOn(store, "transaction").mockRejectedValue(new Error("connection lost"));

    await expect(editTag(store, { id: "tag-1", name: "Sin TACC", version: 1 })).rejects.toThrow(
      "connection lost",
    );
  });

  it("runs entirely inside one transaction", async () => {
    const store = new FakeCatalogStore();
    store.seedTag({ id: "tag-1", name: "Sin TACC", active: true, version: 1 });

    await editTag(store, { id: "tag-1", name: "Sin gluten", version: 1 });

    expect(store.transactionCount).toBe(1);
  });
});
