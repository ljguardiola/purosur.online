import { describe, expect, it, vi } from "vitest";
import { createTag } from "./create-tag.js";
import { FakeCatalogStore } from "./test-support/fake-catalog-store.js";

describe("createTag", () => {
  it("creates an active tag at version 1", async () => {
    const store = new FakeCatalogStore();

    const outcome = await createTag(store, { name: "Sin TACC" });

    expect(outcome).toEqual({
      kind: "created",
      tag: { id: "tag-1", name: "Sin TACC", active: true, version: 1 },
    });
    expect(store.snapshot().tags).toEqual([
      { id: "tag-1", name: "Sin TACC", active: true, version: 1 },
    ]);
  });

  it("gives each created tag its own id", async () => {
    const store = new FakeCatalogStore();

    const first = await createTag(store, { name: "Sin TACC" });
    const second = await createTag(store, { name: "Vegano" });

    expect([first, second].map((outcome) => outcome.kind === "created" && outcome.tag.id)).toEqual([
      "tag-1",
      "tag-2",
    ]);
  });

  it("rejects a name another tag already has, ignoring letter case", async () => {
    const store = new FakeCatalogStore();
    store.seedTag({ id: "tag-7", name: "Sin TACC", active: true, version: 1 });

    const outcome = await createTag(store, { name: "sIN tacc" });

    expect(outcome).toEqual({ kind: "name_taken" });
    expect(store.snapshot().tags).toHaveLength(1);
  });

  it("rejects a name a deactivated tag already has", async () => {
    const store = new FakeCatalogStore();
    store.seedTag({ id: "tag-7", name: "Orgánico", active: false, version: 2 });

    const outcome = await createTag(store, { name: "Orgánico" });

    expect(outcome).toEqual({ kind: "name_taken" });
  });

  it("maps a name race caught by the store's insert to name_taken, leaving no tag behind", async () => {
    const store = new FakeCatalogStore();
    store.tagNameConflicts.add("sin tacc");

    const outcome = await createTag(store, { name: "Sin TACC" });

    expect(outcome).toEqual({ kind: "name_taken" });
    expect(store.snapshot().tags).toEqual([]);
  });

  it("lets an error that is not a name conflict through", async () => {
    const store = new FakeCatalogStore();
    vi.spyOn(store, "transaction").mockRejectedValue(new Error("connection lost"));

    await expect(createTag(store, { name: "Sin TACC" })).rejects.toThrow("connection lost");
  });

  it("runs entirely inside one transaction", async () => {
    const store = new FakeCatalogStore();

    await createTag(store, { name: "Sin TACC" });

    expect(store.transactionCount).toBe(1);
  });
});
