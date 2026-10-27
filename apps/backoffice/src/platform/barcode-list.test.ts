import { expect, test } from "vitest";
import {
  barcodesWithScan,
  barcodeTakenError,
  internalBarcodeGenerationRequestFrom,
} from "./barcode-list";

test("internalBarcodeGenerationRequestFrom builds the request only for a list with no barcode", () => {
  expect(internalBarcodeGenerationRequestFrom([])).toEqual({ barcodes: [] });
  expect(internalBarcodeGenerationRequestFrom(["7790987000015"])).toBeUndefined();
});

test("barcodesWithScan appends the code typed in the scan input", () => {
  expect(barcodesWithScan({ codes: ["7790987000015"], scan: " 7790987000022 " })).toEqual([
    "7790987000015",
    "7790987000022",
  ]);
  expect(barcodesWithScan({ codes: ["7790987000015"], scan: "  " })).toEqual(["7790987000015"]);
});

test("barcodeTakenError names the taken codes, singular or plural", () => {
  expect(barcodeTakenError(["7790987000022"])).toBe(
    "El código 7790987000022 ya es de otro producto.",
  );
  expect(barcodeTakenError(["7790987000022", "7790987000039"])).toBe(
    "Los códigos 7790987000022, 7790987000039 ya son de otro producto.",
  );
  expect(barcodeTakenError([])).toBe("Alguno de los códigos ya es de otro producto.");
});
