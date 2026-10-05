import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  addsInternalBarcodeToProductWithBarcodes,
  BARCODE_MAX_LENGTH,
  barcodeLength,
  barcodeListProblem,
  isBarcodeTooLong,
  isNetContentUnit,
  isProductNameTooLong,
  isValidNetContentQuantity,
  NET_CONTENT_QUANTITY_MAX,
  NET_CONTENT_QUANTITY_MAX_DECIMALS,
  NET_CONTENT_UNITS,
  PRODUCT_BARCODES_MAX_COUNT,
  PRODUCT_NAME_MAX_LENGTH,
  productNameLength,
} from "./product.js";

const fullUnicodeCodePoint = fc
  .integer({ min: 0, max: 0x10ffff })
  .filter((codePoint) => codePoint < 0xd800 || codePoint > 0xdfff)
  .map((codePoint) => String.fromCodePoint(codePoint));

describe("PRODUCT_NAME_MAX_LENGTH", () => {
  it("allows product names of up to 100 characters", () => {
    expect(PRODUCT_NAME_MAX_LENGTH).toBe(100);
  });
});

describe("productNameLength", () => {
  it("counts each letter as one character", () => {
    expect(productNameLength("Semillas")).toBe(8);
  });

  it("counts each emoji as one character", () => {
    expect(productNameLength("🌱".repeat(3))).toBe(3);
    expect(productNameLength("Café 🌱")).toBe(6);
  });
});

describe("isProductNameTooLong", () => {
  it("accepts a name of exactly 100 characters", () => {
    expect(isProductNameTooLong("a".repeat(PRODUCT_NAME_MAX_LENGTH))).toBe(false);
  });

  it("rejects a name of 101 characters", () => {
    expect(isProductNameTooLong("a".repeat(PRODUCT_NAME_MAX_LENGTH + 1))).toBe(true);
  });

  it("counts each emoji as one character toward the 100-character limit", () => {
    expect(isProductNameTooLong("🌱".repeat(PRODUCT_NAME_MAX_LENGTH))).toBe(false);
    expect(isProductNameTooLong("🌱".repeat(PRODUCT_NAME_MAX_LENGTH + 1))).toBe(true);
  });

  it("is true exactly when the name's code point count exceeds the limit, for any mix of code points including ones outside the Basic Multilingual Plane", () => {
    fc.assert(
      fc.property(fc.array(fullUnicodeCodePoint, { maxLength: 150 }), (codePoints) => {
        const name = codePoints.join("");
        expect(productNameLength(name)).toBe(codePoints.length);
        expect(isProductNameTooLong(name)).toBe(codePoints.length > PRODUCT_NAME_MAX_LENGTH);
      }),
    );
  });
});

describe("BARCODE_MAX_LENGTH", () => {
  it("allows barcodes of up to 64 characters", () => {
    expect(BARCODE_MAX_LENGTH).toBe(64);
  });
});

describe("barcodeLength", () => {
  it("counts each character as one", () => {
    expect(barcodeLength("7791234567890")).toBe(13);
  });

  it("counts each emoji as one character toward the 64-character limit", () => {
    expect(barcodeLength("🔖".repeat(64))).toBe(BARCODE_MAX_LENGTH);
    expect(barcodeLength("🔖".repeat(65))).toBeGreaterThan(BARCODE_MAX_LENGTH);
  });
});

describe("isBarcodeTooLong", () => {
  it("accepts a barcode of exactly 64 characters", () => {
    expect(isBarcodeTooLong("a".repeat(BARCODE_MAX_LENGTH))).toBe(false);
  });

  it("rejects a barcode of 65 characters", () => {
    expect(isBarcodeTooLong("a".repeat(BARCODE_MAX_LENGTH + 1))).toBe(true);
  });

  it("counts each emoji as one character toward the 64-character limit", () => {
    expect(isBarcodeTooLong("🔖".repeat(BARCODE_MAX_LENGTH))).toBe(false);
    expect(isBarcodeTooLong("🔖".repeat(BARCODE_MAX_LENGTH + 1))).toBe(true);
  });

  it("is true exactly when the barcode's code point count exceeds the limit, for any mix of code points including ones outside the Basic Multilingual Plane", () => {
    fc.assert(
      fc.property(fc.array(fullUnicodeCodePoint, { maxLength: 100 }), (codePoints) => {
        const code = codePoints.join("");
        expect(barcodeLength(code)).toBe(codePoints.length);
        expect(isBarcodeTooLong(code)).toBe(codePoints.length > BARCODE_MAX_LENGTH);
      }),
    );
  });
});

describe("PRODUCT_BARCODES_MAX_COUNT", () => {
  it("allows up to 20 barcodes on a product", () => {
    expect(PRODUCT_BARCODES_MAX_COUNT).toBe(20);
  });
});

describe("NET_CONTENT_UNITS", () => {
  it("lists grams, kilograms, millilitres, litres, and units", () => {
    expect(NET_CONTENT_UNITS).toEqual(["G", "KG", "ML", "L", "UNIT"]);
  });
});

describe("isValidNetContentQuantity", () => {
  it("accepts a positive quantity with up to 3 decimals", () => {
    expect(isValidNetContentQuantity(1)).toBe(true);
    expect(isValidNetContentQuantity(0.5)).toBe(true);
    expect(isValidNetContentQuantity(1.234)).toBe(true);
  });

  it("rejects zero and negative quantities", () => {
    expect(isValidNetContentQuantity(0)).toBe(false);
    expect(isValidNetContentQuantity(-1)).toBe(false);
  });

  it("rejects a quantity with more than 3 decimals", () => {
    expect(isValidNetContentQuantity(1.2345)).toBe(false);
  });

  it("rounds after scaling so floating-point noise from the multiplication doesn't reject a valid quantity, while a sum with real extra precision is still rejected", () => {
    expect(isValidNetContentQuantity(1.005)).toBe(true);
    expect(isValidNetContentQuantity(0.1 + 0.2)).toBe(false);
  });

  it("rejects a quantity beyond the maximum, accepting the maximum itself", () => {
    expect(isValidNetContentQuantity(NET_CONTENT_QUANTITY_MAX)).toBe(true);
    expect(isValidNetContentQuantity(NET_CONTENT_QUANTITY_MAX + 1)).toBe(false);
  });

  it("rejects a non-finite quantity", () => {
    expect(isValidNetContentQuantity(Number.NaN)).toBe(false);
    expect(isValidNetContentQuantity(Number.POSITIVE_INFINITY)).toBe(false);
  });

  const validScale = 10 ** NET_CONTENT_QUANTITY_MAX_DECIMALS;

  it("accepts every quantity built from up to 3 decimal digits within (0, the maximum]", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: NET_CONTENT_QUANTITY_MAX * validScale }),
        (scaledQuantity) => {
          expect(isValidNetContentQuantity(scaledQuantity / validScale)).toBe(true);
        },
      ),
    );
  });

  it("rejects every quantity carrying a nonzero digit beyond the third decimal, even within range", () => {
    fc.assert(
      fc.property(
        fc
          .integer({ min: 1, max: NET_CONTENT_QUANTITY_MAX * validScale * 10 })
          .filter((scaledQuantity) => scaledQuantity % 10 !== 0),
        (scaledQuantity) => {
          expect(isValidNetContentQuantity(scaledQuantity / (validScale * 10))).toBe(false);
        },
      ),
    );
  });

  it("rejects every quantity at or below zero", () => {
    fc.assert(
      fc.property(fc.double({ max: 0, noNaN: true }), (quantity) => {
        expect(isValidNetContentQuantity(quantity)).toBe(false);
      }),
    );
  });

  it("rejects every otherwise validly-scaled quantity beyond the maximum", () => {
    fc.assert(
      fc.property(
        fc.integer({
          min: NET_CONTENT_QUANTITY_MAX * validScale + 1,
          max: NET_CONTENT_QUANTITY_MAX * validScale + 1_000_000,
        }),
        (scaledQuantity) => {
          expect(isValidNetContentQuantity(scaledQuantity / validScale)).toBe(false);
        },
      ),
    );
  });
});

describe("isNetContentUnit", () => {
  it.each(NET_CONTENT_UNITS)("recognises the listed unit %s", (unit) => {
    expect(isNetContentUnit(unit)).toBe(true);
  });

  it.each(["g", "LB", "", 1, null, undefined, {}])("rejects %j", (value) => {
    expect(isNetContentUnit(value)).toBe(false);
  });
});

describe("barcodeListProblem", () => {
  it("finds no problem in a list of distinct codes without whitespace within the limits", () => {
    expect(barcodeListProblem(["111", "222"])).toBeUndefined();
    expect(barcodeListProblem(["a".repeat(BARCODE_MAX_LENGTH)])).toBeUndefined();
    expect(
      barcodeListProblem(Array.from({ length: PRODUCT_BARCODES_MAX_COUNT }, (_, i) => `${i}`)),
    ).toBeUndefined();
  });

  it("finds too many codes beyond the maximum count", () => {
    expect(
      barcodeListProblem(Array.from({ length: PRODUCT_BARCODES_MAX_COUNT + 1 }, (_, i) => `${i}`)),
    ).toBe("too_many");
  });

  it("finds a code longer than the maximum", () => {
    expect(barcodeListProblem(["a".repeat(BARCODE_MAX_LENGTH + 1)])).toBe("too_long");
  });

  it("finds a code containing whitespace", () => {
    expect(barcodeListProblem(["11 1"])).toBe("whitespace");
    expect(barcodeListProblem(["11\t1"])).toBe("whitespace");
  });

  it("finds a code sent more than once", () => {
    expect(barcodeListProblem(["111", "222", "111"])).toBe("repeated");
  });

  it("reports the count before any single code's problem", () => {
    const codes = Array.from({ length: PRODUCT_BARCODES_MAX_COUNT + 1 }, () => "a b");

    expect(barcodeListProblem(codes)).toBe("too_many");
  });

  it("reports the first problem in the order the codes were sent", () => {
    expect(barcodeListProblem(["1 1", "a".repeat(BARCODE_MAX_LENGTH + 1)])).toBe("whitespace");
    expect(barcodeListProblem(["a".repeat(BARCODE_MAX_LENGTH + 1), "1 1"])).toBe("too_long");
    expect(barcodeListProblem(["111", "111", "1 1"])).toBe("repeated");
  });

  it("checks a code's length before its whitespace", () => {
    expect(barcodeListProblem([`${"a".repeat(BARCODE_MAX_LENGTH)} `])).toBe("too_long");
  });

  it("finds no problem in one internal code listed beside a supplier's", () => {
    expect(barcodeListProblem(["7790987000015", "2000000000015"])).toBeUndefined();
  });

  it("finds a second internal code", () => {
    expect(barcodeListProblem(["2000000000015", "7790987000015", "2000000000022"])).toBe(
      "several_internal",
    );
  });

  it("does not count a code in the internal range without its check digit as internal", () => {
    expect(barcodeListProblem(["2000000000015", "2000000000016"])).toBeUndefined();
  });

  it("reports a single code's problem before a second internal code", () => {
    expect(barcodeListProblem(["2000000000015", "2000000000022", "1 1"])).toBe("whitespace");
    expect(barcodeListProblem(["2000000000015", "2000000000022", "2000000000015"])).toBe(
      "repeated",
    );
  });
});

describe("addsInternalBarcodeToProductWithBarcodes", () => {
  it("is false for a product that had no barcode at all", () => {
    expect(addsInternalBarcodeToProductWithBarcodes([], ["2000000000015"])).toBe(false);
    expect(addsInternalBarcodeToProductWithBarcodes([], ["2000000000015", "7790987000015"])).toBe(
      false,
    );
  });

  it("is true for an internal code added to a product that already had a barcode", () => {
    expect(
      addsInternalBarcodeToProductWithBarcodes(
        ["7790987000015"],
        ["7790987000015", "2000000000015"],
      ),
    ).toBe(true);
  });

  it("is true for an internal code replacing every barcode the product had", () => {
    expect(addsInternalBarcodeToProductWithBarcodes(["7790987000015"], ["2000000000015"])).toBe(
      true,
    );
  });

  it("is true for an internal code replacing the product's own internal code", () => {
    expect(addsInternalBarcodeToProductWithBarcodes(["2000000000015"], ["2000000000022"])).toBe(
      true,
    );
  });

  it("is false for a product keeping its internal code while adding a supplier's", () => {
    expect(
      addsInternalBarcodeToProductWithBarcodes(
        ["2000000000015"],
        ["2000000000015", "7790987000015"],
      ),
    ).toBe(false);
  });

  it("is false for a product adding only codes outside the internal range", () => {
    expect(
      addsInternalBarcodeToProductWithBarcodes(
        ["7790987000015"],
        ["7790987000015", "2000000000016"],
      ),
    ).toBe(false);
  });

  it("is false for a product dropping its internal code", () => {
    expect(
      addsInternalBarcodeToProductWithBarcodes(
        ["2000000000015", "7790987000015"],
        ["7790987000015"],
      ),
    ).toBe(false);
  });
});
