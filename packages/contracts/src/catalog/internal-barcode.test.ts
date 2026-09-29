import { describe, expect, it } from "vitest";
import { internalBarcodeSchema } from "./internal-barcode.js";

describe("internalBarcodeSchema", () => {
  it("accepts a code and strips keys it does not define", () => {
    expect(internalBarcodeSchema.safeParse({ code: "2000000000015", extra: 1 }).data).toEqual({
      code: "2000000000015",
    });
  });

  it.each([undefined, null, {}, { code: 2000000000015 }, { code: null }, "2000000000015"])(
    "refuses %j",
    (body) => {
      expect(internalBarcodeSchema.safeParse(body).success).toBe(false);
    },
  );
});
