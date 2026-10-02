import { describe, expect, it, vi } from "vitest";
import { editBrand } from "./edit-brand.js";
import { FakeCatalogStore } from "./test-support/fake-catalog-store.js";

describe("editBrand", () => {
  it("answers not_found for a brand that is missing when it is locked, changing nothing", async () => {
    const store = new FakeCatalogStore();
    store.seedBrand({ id: "decoy", name: "Decoy", active: true, version: 1 });

    const outcome = await editBrand(store, { id: "missing", name: "Granix", version: 1 });

    expect(outcome).toEqual({ kind: "not_found" });
    expect(store.snapshot().brands).toEqual([
      { id: "decoy", name: "Decoy", active: true, version: 1 },
    ]);
  });

  it("rejects a stale version", async () => {
    const store = new FakeCatalogStore();
    store.seedBrand({ id: "brand-1", name: "Granix", active: true, version: 2 });

    const outcome = await editBrand(store, { id: "brand-1", name: "Granix Pro", version: 1 });

    expect(outcome).toEqual({ kind: "stale_version" });
    expect(store.snapshot().brands).toEqual([
      { id: "brand-1", name: "Granix", active: true, version: 2 },
    ]);
  });

  it("renames the brand, bumping the version and keeping its active state", async () => {
    const store = new FakeCatalogStore();
    store.seedBrand({ id: "decoy", name: "Decoy", active: true, version: 5 });
    store.seedBrand({ id: "brand-1", name: "Granix", active: false, version: 3 });

    const outcome = await editBrand(store, { id: "brand-1", name: "Granix Pro", version: 3 });

    expect(outcome).toEqual({
      kind: "applied",
      brand: { id: "brand-1", name: "Granix Pro", active: false, version: 4 },
    });
    expect(store.snapshot().brands).toEqual([
      { id: "decoy", name: "Decoy", active: true, version: 5 },
      { id: "brand-1", name: "Granix Pro", active: false, version: 4 },
    ]);
    expect(store.lockCallOrder).toEqual(["lockBrand"]);
  });

  it("keeps an unchanged name as a no-op that does not bump the version", async () => {
    const store = new FakeCatalogStore();
    store.seedBrand({ id: "brand-1", name: "Granix", active: true, version: 3 });
    store.brandNameConflicts.add("granix");

    const outcome = await editBrand(store, { id: "brand-1", name: "Granix", version: 3 });

    expect(outcome).toEqual({
      kind: "applied",
      brand: { id: "brand-1", name: "Granix", active: true, version: 3 },
    });
    expect(store.snapshot().brands).toEqual([
      { id: "brand-1", name: "Granix", active: true, version: 3 },
    ]);
  });

  it("lets a brand change only the case of its own name", async () => {
    const store = new FakeCatalogStore();
    store.seedBrand({ id: "brand-1", name: "granix", active: true, version: 1 });

    const outcome = await editBrand(store, { id: "brand-1", name: "Granix", version: 1 });

    expect(outcome).toEqual({
      kind: "applied",
      brand: { id: "brand-1", name: "Granix", active: true, version: 2 },
    });
  });

  it("rejects a name another brand already has, ignoring letter case and whether it is active", async () => {
    const store = new FakeCatalogStore();
    store.seedBrand({ id: "brand-1", name: "Granix", active: true, version: 1 });
    store.seedBrand({ id: "brand-2", name: "Vitaco", active: false, version: 1 });

    const outcome = await editBrand(store, { id: "brand-1", name: "VITACO", version: 1 });

    expect(outcome).toEqual({ kind: "name_taken" });
    expect(store.snapshot().brands[0]).toEqual({
      id: "brand-1",
      name: "Granix",
      active: true,
      version: 1,
    });
  });

  it("maps a name race caught by the store's write to name_taken", async () => {
    const store = new FakeCatalogStore();
    store.seedBrand({ id: "brand-1", name: "Granix", active: true, version: 1 });
    store.brandNameConflicts.add("vitaco");

    const outcome = await editBrand(store, { id: "brand-1", name: "Vitaco", version: 1 });

    expect(outcome).toEqual({ kind: "name_taken" });
    expect(store.snapshot().brands[0]?.name).toBe("Granix");
  });

  it("lets an error that is not a name conflict through", async () => {
    const store = new FakeCatalogStore();
    vi.spyOn(store, "transaction").mockRejectedValue(new Error("connection lost"));

    await expect(editBrand(store, { id: "brand-1", name: "Granix", version: 1 })).rejects.toThrow(
      "connection lost",
    );
  });

  it("runs entirely inside one transaction", async () => {
    const store = new FakeCatalogStore();
    store.seedBrand({ id: "brand-1", name: "Granix", active: true, version: 1 });

    await editBrand(store, { id: "brand-1", name: "Granix Pro", version: 1 });

    expect(store.transactionCount).toBe(1);
  });
});
