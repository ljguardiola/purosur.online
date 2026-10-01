import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { appendEan13CheckDigit } from "./ean13.js";
import {
  isValidLabelCount,
  LABELS_MAX_COUNT_PER_PRODUCT,
  LABELS_MAX_TOTAL_COUNT,
  labelRequestProblem,
  productLabelCode,
} from "./label-request.js";

const INTERNAL_CODE = appendEan13CheckDigit("200000000001");
const OTHER_INTERNAL_CODE = appendEan13CheckDigit("200000000002");
const MANUFACTURER_CODE = "7790001000011";

describe("LABELS_MAX_COUNT_PER_PRODUCT", () => {
  it("allows up to 999 labels of one product in a single sheet request", () => {
    expect(LABELS_MAX_COUNT_PER_PRODUCT).toBe(999);
  });
});

describe("LABELS_MAX_TOTAL_COUNT", () => {
  it("allows up to 2400 labels, 100 sheets of 24, in a single sheet request", () => {
    expect(LABELS_MAX_TOTAL_COUNT).toBe(2400);
  });
});

describe("isValidLabelCount", () => {
  it("accepts every whole count from one to the per-product limit", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: LABELS_MAX_COUNT_PER_PRODUCT }), (count) => {
        expect(isValidLabelCount(count)).toBe(true);
      }),
    );
  });

  it.each([
    0,
    -1,
    LABELS_MAX_COUNT_PER_PRODUCT + 1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])("refuses %s labels of one product", (count) => {
    expect(isValidLabelCount(count)).toBe(false);
  });
});

describe("labelRequestProblem", () => {
  it("finds no problem in distinct products whose labels add up to the total limit", () => {
    expect(
      labelRequestProblem([
        { productId: "a", count: LABELS_MAX_COUNT_PER_PRODUCT },
        { productId: "b", count: LABELS_MAX_COUNT_PER_PRODUCT },
        { productId: "c", count: LABELS_MAX_TOTAL_COUNT - LABELS_MAX_COUNT_PER_PRODUCT * 2 },
      ]),
    ).toBeUndefined();
  });

  it("finds no problem in an empty request", () => {
    expect(labelRequestProblem([])).toBeUndefined();
  });

  it("refuses the same product asked for twice", () => {
    expect(
      labelRequestProblem([
        { productId: "a", count: 1 },
        { productId: "b", count: 1 },
        { productId: "a", count: 2 },
      ]),
    ).toBe("repeated_product");
  });

  it("refuses labels adding up to one over the total limit", () => {
    expect(
      labelRequestProblem([
        { productId: "a", count: LABELS_MAX_COUNT_PER_PRODUCT },
        { productId: "b", count: LABELS_MAX_COUNT_PER_PRODUCT },
        { productId: "c", count: LABELS_MAX_TOTAL_COUNT - LABELS_MAX_COUNT_PER_PRODUCT * 2 + 1 },
      ]),
    ).toBe("too_many_labels");
  });

  it("reports a repeated product before a total over the limit", () => {
    expect(
      labelRequestProblem([
        { productId: "a", count: LABELS_MAX_COUNT_PER_PRODUCT },
        { productId: "b", count: LABELS_MAX_COUNT_PER_PRODUCT },
        { productId: "c", count: LABELS_MAX_COUNT_PER_PRODUCT },
        { productId: "a", count: 1 },
      ]),
    ).toBe("repeated_product");
  });
});

describe("productLabelCode", () => {
  it("gives an active product's internal barcode", () => {
    expect(productLabelCode({ active: true, barcodes: [MANUFACTURER_CODE, INTERNAL_CODE] })).toBe(
      INTERNAL_CODE,
    );
  });

  it("gives the first internal barcode of a product with more than one", () => {
    expect(
      productLabelCode({ active: true, barcodes: [OTHER_INTERNAL_CODE, INTERNAL_CODE] }),
    ).toBe(OTHER_INTERNAL_CODE);
  });

  it("gives nothing for an active product without an internal barcode", () => {
    expect(productLabelCode({ active: true, barcodes: [MANUFACTURER_CODE] })).toBeNull();
    expect(productLabelCode({ active: true, barcodes: [] })).toBeNull();
  });

  it("gives nothing for an inactive product, even with an internal barcode", () => {
    expect(productLabelCode({ active: false, barcodes: [INTERNAL_CODE] })).toBeNull();
  });
});
