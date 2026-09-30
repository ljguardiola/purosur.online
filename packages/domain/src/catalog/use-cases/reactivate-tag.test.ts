import { describe, expect, it } from "vitest";
import { reactivateTag } from "./reactivate-tag.js";
import { FakeCatalogStore } from "./test-support/fake-catalog-store.js";

describe("reactivateTag", () => {
  it("answers not_found for an id that doesn't exist", async () => {
    const store = new FakeCatalogStore();

    const outcome = await reactivateTag(store, "missing");

    expect(outcome).toEqual({ kind: "not_found" });
  });

  it("answers already_active for a tag that is already active, changing nothing", async () => {
    const store = new FakeCatalogStore();
    store.seedTag({ id: "tag-1", name: "Sin TACC", active: true, version: 2 });

    const outcome = await reactivateTag(store, "tag-1");

    expect(outcome).toEqual({ kind: "already_active" });
    expect(store.snapshot().tags).toEqual([
      { id: "tag-1", name: "Sin TACC", active: true, version: 2 },
    ]);
  });

  it("reactivates the tag, bumping the version", async () => {
    const store = new FakeCatalogStore();
    store.seedTag({ id: "decoy", name: "Decoy", active: false, version: 9 });
    store.seedTag({ id: "tag-1", name: "Orgánico", active: false, version: 3 });

    const outcome = await reactivateTag(store, "tag-1");

    expect(outcome).toEqual({ kind: "reactivated" });
    expect(store.snapshot().tags).toEqual([
      { id: "decoy", name: "Decoy", active: false, version: 9 },
      { id: "tag-1", name: "Orgánico", active: true, version: 4 },
    ]);
    expect(store.lockCallOrder).toEqual(["lockTag"]);
  });

  it("runs entirely inside one transaction", async () => {
    const store = new FakeCatalogStore();
    store.seedTag({ id: "tag-1", name: "Sin TACC", active: false, version: 1 });

    await reactivateTag(store, "tag-1");

    expect(store.transactionCount).toBe(1);
  });
});
