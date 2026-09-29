import { describe, expect, it, vi } from "vitest";
import { createBrand } from "./create-brand.js";
import { FakeCatalogStore } from "./test-support/fake-catalog-store.js";

describe("createBrand", () => {
  it("creates an active brand at version 1", async () => {
    const store = new FakeCatalogStore();

    const outcome = await createBrand(store, { name: "Granix" });

    expect(outcome).toEqual({
      kind: "created",
      brand: { id: "brand-1", name: "Granix", active: true, version: 1 },
    });
    expect(store.snapshot().brands).toEqual([
      { id: "brand-1", name: "Granix", active: true, version: 1 },
    ]);
  });

  it("gives each created brand its own id", async () => {
    const store = new FakeCatalogStore();

    const first = await createBrand(store, { name: "Granix" });
    const second = await createBrand(store, { name: "Vitaco" });

    expect(
      [first, second].map((outcome) => outcome.kind === "created" && outcome.brand.id),
    ).toEqual(["brand-1", "brand-2"]);
  });

  it("rejects a name another brand already has, ignoring letter case", async () => {
    const store = new FakeCatalogStore();
    store.seedBrand({ id: "brand-7", name: "Granix", active: true, version: 1 });

    const outcome = await createBrand(store, { name: "gRANIX" });

    expect(outcome).toEqual({ kind: "name_taken" });
    expect(store.snapshot().brands).toHaveLength(1);
  });

  it("rejects a name a deactivated brand already has", async () => {
    const store = new FakeCatalogStore();
    store.seedBrand({ id: "brand-7", name: "Yerba del Litoral", active: false, version: 2 });

    const outcome = await createBrand(store, { name: "Yerba del Litoral" });

    expect(outcome).toEqual({ kind: "name_taken" });
  });

  it("maps a name race caught by the store's insert to name_taken, leaving no brand behind", async () => {
    const store = new FakeCatalogStore();
    store.brandNameConflicts.add("granix");

    const outcome = await createBrand(store, { name: "Granix" });

    expect(outcome).toEqual({ kind: "name_taken" });
    expect(store.snapshot().brands).toEqual([]);
  });

  it("lets an error that is not a name conflict through", async () => {
    const store = new FakeCatalogStore();
    vi.spyOn(store, "transaction").mockRejectedValue(new Error("connection lost"));

    await expect(createBrand(store, { name: "Granix" })).rejects.toThrow("connection lost");
  });

  it("runs entirely inside one transaction", async () => {
    const store = new FakeCatalogStore();

    await createBrand(store, { name: "Granix" });

    expect(store.transactionCount).toBe(1);
  });
});
