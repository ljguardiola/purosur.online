import { describe, expect, it, vi } from "vitest";
import { reactivateProduct } from "./reactivate-product.js";
import { FakeCatalogStore } from "./test-support/fake-catalog-store.js";

function inactiveProduct(store: FakeCatalogStore, id = "product-1", codes = ["111"]): void {
  store.seedProduct(
    {
      id,
      name: "Yerba",
      categoryId: "category-1",
      brandId: null,
      saleUnit: "UNIT",
      netContent: null,
      active: false,
      version: 3,
    },
    codes.map((code) => ({ code, active: false })),
  );
}

function activeProduct(store: FakeCatalogStore, id: string, codes: string[]): void {
  store.seedProduct(
    {
      id,
      name: "Otro",
      categoryId: "category-1",
      brandId: null,
      saleUnit: "UNIT",
      netContent: null,
      active: true,
      version: 9,
    },
    codes.map((code) => ({ code })),
  );
}

describe("reactivateProduct", () => {
  it("answers not_found for an id that doesn't exist", async () => {
    const store = new FakeCatalogStore();

    expect(await reactivateProduct(store, "missing")).toEqual({ kind: "not_found" });
  });

  it("answers already_active for an active product and changes nothing", async () => {
    const store = new FakeCatalogStore();
    activeProduct(store, "product-1", ["111"]);
    const before = store.snapshot();

    const outcome = await reactivateProduct(store, "product-1");

    expect(outcome).toEqual({ kind: "already_active" });
    expect(store.snapshot()).toEqual(before);
  });

  it("reactivates the product and its barcodes, bumping the version", async () => {
    const store = new FakeCatalogStore();
    activeProduct(store, "decoy", ["900"]);
    inactiveProduct(store, "product-1", ["111", "222"]);
    inactiveProduct(store, "other-inactive", ["333"]);

    const outcome = await reactivateProduct(store, "product-1");

    expect(outcome).toEqual({ kind: "reactivated" });
    expect(
      store.snapshot().products.map(({ id, active, version }) => ({ id, active, version })),
    ).toEqual([
      { id: "decoy", active: true, version: 9 },
      { id: "product-1", active: true, version: 4 },
      { id: "other-inactive", active: false, version: 3 },
    ]);
    expect(store.snapshot().barcodes).toEqual([
      { productId: "decoy", code: "900", active: true },
      { productId: "product-1", code: "111", active: true },
      { productId: "product-1", code: "222", active: true },
      { productId: "other-inactive", code: "333", active: false },
    ]);
    expect(store.lockCallOrder).toEqual(["lockProduct"]);
  });

  it("answers barcode_taken with the codes another active product holds and changes nothing", async () => {
    const store = new FakeCatalogStore();
    activeProduct(store, "holder", ["222", "999"]);
    inactiveProduct(store, "product-1", ["111", "222"]);
    const before = store.snapshot();

    const outcome = await reactivateProduct(store, "product-1");

    expect(outcome).toEqual({ kind: "barcode_taken", codes: ["222"] });
    expect(store.snapshot()).toEqual(before);
  });

  it("maps a barcode race lost when writing the barcodes to barcode_taken, rolling back the reactivation", async () => {
    const store = new FakeCatalogStore();
    inactiveProduct(store, "product-1", ["111", "222"]);
    store.barcodeConflicts.set("222", "winner");
    store.barcodeConflicts.set("111", "product-1");
    const before = store.snapshot();

    const outcome = await reactivateProduct(store, "product-1");

    expect(outcome).toEqual({ kind: "barcode_taken", codes: ["222"] });
    expect(store.snapshot()).toEqual(before);
  });

  it("lets an error that is not a barcode conflict through", async () => {
    const store = new FakeCatalogStore();
    vi.spyOn(store, "transaction").mockRejectedValue(new Error("connection lost"));

    await expect(reactivateProduct(store, "product-1")).rejects.toThrow("connection lost");
  });

  it("runs entirely inside one transaction", async () => {
    const store = new FakeCatalogStore();
    inactiveProduct(store);

    await reactivateProduct(store, "product-1");

    expect(store.transactionCount).toBe(1);
  });
});
