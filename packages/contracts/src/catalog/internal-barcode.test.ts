import { describe, expect, it } from "vitest";
import { internalBarcodeGenerationBodySchema, internalBarcodeSchema } from "./internal-barcode.js";

describe("internalBarcodeSchema", () => {
  it("accepts a code and strips keys it does not define", () => {
    expect(internalBarcodeSchema.safeParse({ code: "2000000000015", extra: 1 }).data).toEqual({
      code: "2000000000015",
    });
  });

  it.each(["1234567890128", "2000000000016", "200000000001", "20000000000150", ""])(
    "refuses %j as the code",
    (code) => {
      expect(internalBarcodeSchema.safeParse({ code }).success).toBe(false);
    },
  );

  it.each([undefined, null, {}, { code: 2000000000015 }, { code: null }, "2000000000015"])(
    "refuses %j",
    (body) => {
      expect(internalBarcodeSchema.safeParse(body).success).toBe(false);
    },
  );
});

describe("internalBarcodeGenerationBodySchema", () => {
  it("accepts a product with no barcode and strips keys it does not define", () => {
    expect(internalBarcodeGenerationBodySchema.safeParse({ barcodes: [], extra: 1 }).data).toEqual({
      barcodes: [],
    });
  });

  it.each([["7790987000015"], ["2000000000015"]])(
    "refuses generating an internal code for a product already holding %j",
    (code) => {
      const result = internalBarcodeGenerationBodySchema.safeParse({ barcodes: [code] });

      expect(result.error?.issues).toEqual([
        expect.objectContaining({
          path: ["barcodes"],
          message: "an internal barcode is only generated for a product with no barcode",
        }),
      ]);
    },
  );

  it.each([
    undefined,
    null,
    {},
    { barcodes: "2000000000015" },
    { barcodes: [1] },
    { barcodes: null },
  ])("refuses %j", (body) => {
    expect(internalBarcodeGenerationBodySchema.safeParse(body).success).toBe(false);
  });
});
