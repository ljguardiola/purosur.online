import { expect, test } from "vitest";
import { barcodesSummary } from "./barcodes-summary";

test("is empty for a product with no barcode", () => {
  expect(barcodesSummary([])).toBe("");
});

test("is the barcode itself for a product with one", () => {
  expect(barcodesSummary(["7790001234567"])).toBe("7790001234567");
});

test("is the first barcode and how many more there are for a product with several", () => {
  expect(barcodesSummary(["7790001234567", "7790001234574"])).toBe("7790001234567 +1");
  expect(barcodesSummary(["1", "2", "3"])).toBe("1 +2");
});
