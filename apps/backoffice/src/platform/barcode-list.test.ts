import { describe, expect, it, test } from "vitest";
import {
  barcodeListMessage,
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

describe("barcodeListMessage", () => {
  const withBarcodes = (codes: string[], scan = "") => ({ barcodes: { codes, scan } });

  it("asks for a code when there is neither a listed one nor one typed", () => {
    expect(barcodeListMessage(withBarcodes([], "  "))).toBe(
      "Escaneá al menos un código de barras.",
    );
  });

  it("names the problem of the listed codes together with the one typed", () => {
    expect(barcodeListMessage(withBarcodes(["779"], "779 0"))).toBe(
      "El código de barras no puede tener espacios.",
    );
    expect(barcodeListMessage(withBarcodes(["779"], "779"))).toBe(
      "Ese código ya está en la lista.",
    );
    expect(barcodeListMessage(withBarcodes([], "1".repeat(65)))).toBe(
      "El código de barras puede tener hasta 64 caracteres.",
    );
    expect(
      barcodeListMessage(
        withBarcodes(
          Array.from({ length: 20 }, (_, index) => `c${index}`),
          "x",
        ),
      ),
    ).toBe("El producto puede tener hasta 20 códigos de barras.");
    expect(barcodeListMessage(withBarcodes(["2000000000015"], "2000000000022"))).toBe(
      "El producto puede tener un solo código interno.",
    );
    expect(barcodeListMessage(withBarcodes(["2000000000015"], "7790987000015"))).toBe(
      "El código interno tiene que ser el único del producto.",
    );
  });

  it("says a list that passes every local check was refused by the cloud", () => {
    expect(barcodeListMessage(withBarcodes(["779"], "780"))).toBe(
      "Alguno de los códigos de barras no es válido.",
    );
  });
});
