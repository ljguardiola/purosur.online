import { describe, expect, it } from "vitest";
import { prepareLabelSheet } from "./prepare-label-sheet.js";
import { FakeLabelProductReader } from "./test-support/fake-label-product-reader.js";

const INTERNAL_CODE = "2000000000015";
const OTHER_INTERNAL_CODE = "2000000000022";
const MANUFACTURER_CODE = "7790001000011";

const honey = {
  id: "product-1",
  name: "Miel pura de abeja 1 kg",
  active: true,
  barcodes: [MANUFACTURER_CODE, INTERNAL_CODE],
};
const almonds = {
  id: "product-2",
  name: "Almendras peladas",
  active: true,
  barcodes: [OTHER_INTERNAL_CODE],
};

describe("prepareLabelSheet", () => {
  it("gives each requested product's name, label code and count, in the requested order", async () => {
    const reader = new FakeLabelProductReader([honey, almonds]);

    const outcome = await prepareLabelSheet(reader, [
      { productId: "product-2", count: 3 },
      { productId: "product-1", count: 1 },
    ]);

    expect(outcome).toEqual({
      kind: "ready",
      items: [
        { name: "Almendras peladas", code: OTHER_INTERNAL_CODE, count: 3 },
        { name: "Miel pura de abeja 1 kg", code: INTERNAL_CODE, count: 1 },
      ],
    });
  });

  it("reads every requested product at once", async () => {
    const reader = new FakeLabelProductReader([honey, almonds]);

    await prepareLabelSheet(reader, [
      { productId: "product-1", count: 1 },
      { productId: "product-2", count: 1 },
    ]);

    expect(reader.requestedProductIds).toEqual([["product-1", "product-2"]]);
  });

  it("refuses a product that does not exist, naming it", async () => {
    const reader = new FakeLabelProductReader([honey]);

    const outcome = await prepareLabelSheet(reader, [
      { productId: "product-1", count: 1 },
      { productId: "product-9", count: 1 },
    ]);

    expect(outcome).toEqual({ kind: "product_not_found", productId: "product-9" });
  });

  it("refuses an inactive product as one that does not exist", async () => {
    const reader = new FakeLabelProductReader([{ ...honey, active: false }]);

    const outcome = await prepareLabelSheet(reader, [{ productId: "product-1", count: 1 }]);

    expect(outcome).toEqual({ kind: "product_not_found", productId: "product-1" });
  });

  it("refuses an active product without an internal barcode, naming it", async () => {
    const reader = new FakeLabelProductReader([
      honey,
      { ...almonds, barcodes: [MANUFACTURER_CODE] },
    ]);

    const outcome = await prepareLabelSheet(reader, [
      { productId: "product-1", count: 1 },
      { productId: "product-2", count: 1 },
    ]);

    expect(outcome).toEqual({ kind: "product_without_internal_barcode", productId: "product-2" });
  });

  it("reports the first refused product in the requested order", async () => {
    const reader = new FakeLabelProductReader([{ ...honey, barcodes: [MANUFACTURER_CODE] }]);

    const outcome = await prepareLabelSheet(reader, [
      { productId: "product-1", count: 1 },
      { productId: "product-9", count: 1 },
    ]);

    expect(outcome).toEqual({ kind: "product_without_internal_barcode", productId: "product-1" });
  });
});
