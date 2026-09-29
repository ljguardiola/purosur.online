import { describe, expect, it } from "vitest";
import { reactivateBrand } from "./reactivate-brand.js";
import { FakeCatalogStore } from "./test-support/fake-catalog-store.js";

describe("reactivateBrand", () => {
  it("answers not_found for an id that doesn't exist", async () => {
    const store = new FakeCatalogStore();

    const outcome = await reactivateBrand(store, "missing");

    expect(outcome).toEqual({ kind: "not_found" });
  });

  it("answers already_active for a brand that is already active, changing nothing", async () => {
    const store = new FakeCatalogStore();
    store.seedBrand({ id: "brand-1", name: "Granix", active: true, version: 2 });

    const outcome = await reactivateBrand(store, "brand-1");

    expect(outcome).toEqual({ kind: "already_active" });
    expect(store.snapshot().brands).toEqual([
      { id: "brand-1", name: "Granix", active: true, version: 2 },
    ]);
  });

  it("reactivates the brand, bumping the version", async () => {
    const store = new FakeCatalogStore();
    store.seedBrand({ id: "decoy", name: "Decoy", active: false, version: 9 });
    store.seedBrand({ id: "brand-1", name: "Yerba del Litoral", active: false, version: 3 });

    const outcome = await reactivateBrand(store, "brand-1");

    expect(outcome).toEqual({ kind: "reactivated" });
    expect(store.snapshot().brands).toEqual([
      { id: "decoy", name: "Decoy", active: false, version: 9 },
      { id: "brand-1", name: "Yerba del Litoral", active: true, version: 4 },
    ]);
    expect(store.lockCallOrder).toEqual(["lockBrand"]);
  });

  it("runs entirely inside one transaction", async () => {
    const store = new FakeCatalogStore();
    store.seedBrand({ id: "brand-1", name: "Granix", active: false, version: 1 });

    await reactivateBrand(store, "brand-1");

    expect(store.transactionCount).toBe(1);
  });
});
