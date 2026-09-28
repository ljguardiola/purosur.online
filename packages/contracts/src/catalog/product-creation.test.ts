import {
  BARCODE_MAX_LENGTH,
  NET_CONTENT_QUANTITY_MAX,
  NET_CONTENT_QUANTITY_MAX_DECIMALS,
  NET_CONTENT_UNITS,
  PRODUCT_BARCODES_MAX_COUNT,
  PRODUCT_NAME_MAX_LENGTH,
} from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { productCreationBodySchema } from "./product-creation.js";

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Maceta",
    categoryId: "cat-1",
    saleUnit: "UNIT",
    barcodes: ["111"],
    ...overrides,
  };
}

function firstFailure(body: unknown): { field: unknown; message: unknown } | undefined {
  const result = productCreationBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { field: issue.path[0], message: issue.message };
}

function isAccepted(body: unknown): boolean {
  return productCreationBodySchema.safeParse(body).success;
}

describe("productCreationBodySchema, name", () => {
  it("accepts a name and trims it", () => {
    const result = productCreationBodySchema.safeParse(validBody({ name: "  Maceta 20cm  " }));

    expect(result).toMatchObject({ success: true, data: { name: "Maceta 20cm" } });
  });

  it.each([undefined, "", "   ", 42, null])("rejects the name %j as empty", (name) => {
    expect(firstFailure(validBody({ name }))).toEqual({
      field: "name",
      message: "name must not be empty",
    });
  });

  it("accepts a name of exactly the domain's maximum length and rejects a longer one", () => {
    expect(isAccepted(validBody({ name: "a".repeat(PRODUCT_NAME_MAX_LENGTH) }))).toBe(true);
    expect(firstFailure(validBody({ name: "a".repeat(PRODUCT_NAME_MAX_LENGTH + 1) }))).toEqual({
      field: "name",
      message: `name must be at most ${PRODUCT_NAME_MAX_LENGTH} characters`,
    });
  });
});

describe("productCreationBodySchema, categoryId", () => {
  it("keeps the category id as sent", () => {
    const result = productCreationBodySchema.safeParse(validBody({ categoryId: "AbC" }));

    expect(result).toMatchObject({ success: true, data: { categoryId: "AbC" } });
  });

  it.each([undefined, "", 42, null])("rejects the categoryId %j", (categoryId) => {
    expect(firstFailure(validBody({ categoryId }))).toEqual({
      field: "categoryId",
      message: "categoryId must be an existing category's id",
    });
  });
});

describe("productCreationBodySchema, saleUnit", () => {
  it.each(["UNIT", "KG"])("accepts %s", (saleUnit) => {
    expect(isAccepted(validBody({ saleUnit }))).toBe(true);
  });

  it.each([undefined, "unit", "LITER", 1, null])("rejects the saleUnit %j", (saleUnit) => {
    expect(firstFailure(validBody({ saleUnit }))).toEqual({
      field: "saleUnit",
      message: "saleUnit must be UNIT or KG",
    });
  });
});

describe("productCreationBodySchema, barcodes", () => {
  it("accepts codes and trims each, keeping their order", () => {
    const result = productCreationBodySchema.safeParse(validBody({ barcodes: [" 222 ", "111"] }));

    expect(result).toMatchObject({ success: true, data: { barcodes: ["222", "111"] } });
  });

  it.each([undefined, null, "111", [], ["111", 222], ["111", "   "], [""]])(
    "rejects the barcodes %j as not a non-empty list of codes",
    (barcodes) => {
      expect(firstFailure(validBody({ barcodes }))).toEqual({
        field: "barcodes",
        message: "barcodes must be a non-empty list of codes",
      });
    },
  );

  it("accepts the maximum count and rejects one more", () => {
    const codes = Array.from({ length: PRODUCT_BARCODES_MAX_COUNT + 1 }, (_, index) => `c${index}`);

    expect(isAccepted(validBody({ barcodes: codes.slice(0, PRODUCT_BARCODES_MAX_COUNT) }))).toBe(
      true,
    );
    expect(firstFailure(validBody({ barcodes: codes }))).toEqual({
      field: "barcodes",
      message: `a product can have at most ${PRODUCT_BARCODES_MAX_COUNT} barcodes`,
    });
  });

  it("accepts a code of exactly the maximum length and rejects a longer one", () => {
    expect(isAccepted(validBody({ barcodes: ["a".repeat(BARCODE_MAX_LENGTH)] }))).toBe(true);
    expect(firstFailure(validBody({ barcodes: ["a".repeat(BARCODE_MAX_LENGTH + 1)] }))).toEqual({
      field: "barcodes",
      message: `each barcode must be at most ${BARCODE_MAX_LENGTH} characters`,
    });
  });

  it("rejects a code with whitespace inside it", () => {
    expect(firstFailure(validBody({ barcodes: ["111 222"] }))).toEqual({
      field: "barcodes",
      message: "a barcode must not contain whitespace",
    });
  });

  it("rejects a code repeated after trimming", () => {
    expect(firstFailure(validBody({ barcodes: ["111", " 111 "] }))).toEqual({
      field: "barcodes",
      message: "the same barcode was sent more than once",
    });
  });

  it("reports the first problem in the order the codes were sent", () => {
    expect(
      firstFailure(validBody({ barcodes: ["1 1", "a".repeat(BARCODE_MAX_LENGTH + 1)] })),
    ).toEqual({
      field: "barcodes",
      message: "a barcode must not contain whitespace",
    });
  });
});

describe("productCreationBodySchema, netContent", () => {
  it.each([undefined, null])("reads %j as no net content", (netContent) => {
    const result = productCreationBodySchema.safeParse(validBody({ netContent }));

    expect(result).toMatchObject({ success: true, data: { netContent: null } });
  });

  it.each(NET_CONTENT_UNITS)(
    "accepts a quantity in %s and keeps only quantity and unit",
    (unit) => {
      const result = productCreationBodySchema.safeParse(
        validBody({ netContent: { quantity: 1.5, unit, extra: true } }),
      );

      expect(result).toMatchObject({
        success: true,
        data: { netContent: { quantity: 1.5, unit } },
      });
      expect(result.data?.netContent).not.toHaveProperty("extra");
    },
  );

  it.each([
    "1 KG",
    [],
    {},
    { quantity: 1 },
    { unit: "KG" },
    { quantity: "1", unit: "KG" },
    { quantity: 1, unit: "LB" },
    { quantity: 1, unit: null },
  ])("rejects the net content %j as malformed", (netContent) => {
    expect(firstFailure(validBody({ netContent }))).toEqual({
      field: "netContent",
      message: "netContent must be an object with a quantity and a listed unit, or absent/null",
    });
  });

  it.each([0, -1, 1.0001, NET_CONTENT_QUANTITY_MAX + 1, Infinity, -Infinity])(
    "reports the quantity %s under netContentQuantity",
    (quantity) => {
      expect(firstFailure(validBody({ netContent: { quantity, unit: "KG" } }))).toEqual({
        field: "netContentQuantity",
        message: `netContent's quantity must be a positive number of at most ${NET_CONTENT_QUANTITY_MAX_DECIMALS} decimals, at most ${NET_CONTENT_QUANTITY_MAX}`,
      });
    },
  );

  it("accepts the largest quantity", () => {
    expect(
      isAccepted(validBody({ netContent: { quantity: NET_CONTENT_QUANTITY_MAX, unit: "G" } })),
    ).toBe(true);
  });
});

describe("productCreationBodySchema, order and unknown keys", () => {
  it("reports the first failing field in the order name, categoryId, saleUnit, barcodes, netContent", () => {
    const allInvalid = { name: "", categoryId: "", saleUnit: "x", barcodes: [], netContent: "x" };

    expect(firstFailure(allInvalid)?.field).toBe("name");
    expect(firstFailure({ ...allInvalid, name: "a" })?.field).toBe("categoryId");
    expect(firstFailure({ ...allInvalid, name: "a", categoryId: "c" })?.field).toBe("saleUnit");
    expect(firstFailure({ ...allInvalid, name: "a", categoryId: "c", saleUnit: "KG" })?.field).toBe(
      "barcodes",
    );
    expect(
      firstFailure({ ...allInvalid, name: "a", categoryId: "c", saleUnit: "KG", barcodes: ["1"] })
        ?.field,
    ).toBe("netContent");
  });

  it("strips keys it does not know", () => {
    const result = productCreationBodySchema.safeParse(validBody({ version: 3, active: false }));

    expect(result.data).toEqual({
      name: "Maceta",
      categoryId: "cat-1",
      saleUnit: "UNIT",
      barcodes: ["111"],
      netContent: null,
    });
  });

  it("reads a body without any field as failing on the name", () => {
    expect(firstFailure({})?.field).toBe("name");
  });
});
