import { describe, expect, it } from "vitest";
import type { ProductTargetCandidate } from "./discount-target-reader.js";
import { listDiscountTargets } from "./list-discount-targets.js";
import { fakeDiscountTargetReader } from "./test-support/fake-discount-target-reader.js";

function product(overrides: Partial<ProductTargetCandidate> = {}): ProductTargetCandidate {
  return {
    id: "product-1",
    name: "Yerba mate",
    active: true,
    saleUnit: "UNIT",
    brandName: "Playadito",
    netContent: { quantity: 1, unit: "KG" },
    barcodes: ["7790001", "7790002"],
    ...overrides,
  };
}

describe("listDiscountTargets", () => {
  it("offers nothing when there is nothing to target", async () => {
    const targets = await listDiscountTargets({ targets: fakeDiscountTargetReader({}) });

    expect(targets).toEqual({ products: [], categories: [], tags: [] });
  });

  it("offers an active product with what identifies it, in the order it was read", async () => {
    const targets = await listDiscountTargets({
      targets: fakeDiscountTargetReader({
        products: [product({ id: "b", name: "B" }), product({ id: "a", name: "A" })],
      }),
    });

    expect(targets.products.map(({ id }) => id)).toEqual(["b", "a"]);
    expect(targets.products[0]).toEqual({
      id: "b",
      name: "B",
      saleUnit: "UNIT",
      brandName: "Playadito",
      netContent: { quantity: 1, unit: "KG" },
      barcodes: ["7790001", "7790002"],
      benefitKinds: ["PERCENT_OFF", "BUY_N_PAY_M"],
    });
  });

  it("leaves an inactive product out", async () => {
    const targets = await listDiscountTargets({
      targets: fakeDiscountTargetReader({
        products: [product({ id: "kept" }), product({ id: "retired", active: false })],
      }),
    });

    expect(targets.products.map(({ id }) => id)).toEqual(["kept"]);
  });

  it("offers a product sold by weight only for a percent off", async () => {
    const targets = await listDiscountTargets({
      targets: fakeDiscountTargetReader({ products: [product({ saleUnit: "KG" })] }),
    });

    expect(targets.products[0]?.benefitKinds).toEqual(["PERCENT_OFF"]);
  });

  it("offers every category, with its parent, for a percent off only", async () => {
    const targets = await listDiscountTargets({
      targets: fakeDiscountTargetReader({
        categories: [
          { id: "category-1", name: "Almacén", parentId: null },
          { id: "category-2", name: "Yerbas", parentId: "category-1" },
        ],
      }),
    });

    expect(targets.categories).toEqual([
      { id: "category-1", name: "Almacén", parentId: null, benefitKinds: ["PERCENT_OFF"] },
      { id: "category-2", name: "Yerbas", parentId: "category-1", benefitKinds: ["PERCENT_OFF"] },
    ]);
  });

  it("offers an active tag for a percent off only and leaves an inactive one out", async () => {
    const targets = await listDiscountTargets({
      targets: fakeDiscountTargetReader({
        tags: [
          { id: "tag-1", name: "Sin TACC", active: true },
          { id: "tag-2", name: "Artesanal", active: false },
        ],
      }),
    });

    expect(targets.tags).toEqual([
      { id: "tag-1", name: "Sin TACC", benefitKinds: ["PERCENT_OFF"] },
    ]);
  });
});
