import { BARCODE_MAX_LENGTH, PRODUCT_BARCODES_MAX_COUNT, SALE_UNITS } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { productCreationBodySchema } from "./product-creation.js";

const CATEGORY_ID = "11111111-1111-1111-1111-111111111111";

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Maceta",
    categoryId: CATEGORY_ID,
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

function failingFields(body: unknown): unknown[] {
  const result = productCreationBodySchema.safeParse(body);
  return result.success ? [] : result.error.issues.map((issue) => issue.path[0]);
}

function isAccepted(body: unknown): boolean {
  return productCreationBodySchema.safeParse(body).success;
}

describe("productCreationBodySchema, name", () => {
  it("accepts a name and trims it", () => {
    const result = productCreationBodySchema.safeParse(validBody({ name: "  Maceta 20cm  " }));

    expect(result).toMatchObject({ success: true, data: { name: "Maceta 20cm" } });
  });

  it("rejects an empty name", () => {
    expect(firstFailure(validBody({ name: "" }))).toEqual({
      field: "name",
      message: "name must not be empty",
    });
  });
});

describe("productCreationBodySchema, categoryId", () => {
  it("keeps the category id, in its canonical lowercase form", () => {
    const result = productCreationBodySchema.safeParse(
      validBody({ categoryId: "D131EC62-1111-4AAA-8BBB-ABCDEF012345" }),
    );

    expect(result).toMatchObject({
      success: true,
      data: { categoryId: "d131ec62-1111-4aaa-8bbb-abcdef012345" },
    });
  });

  it.each([undefined, "", "not-an-id", 42, null])("rejects the categoryId %j", (categoryId) => {
    expect(firstFailure(validBody({ categoryId }))).toEqual({
      field: "categoryId",
      message: "categoryId must be an existing category's id",
    });
  });
});

describe("productCreationBodySchema, brandId", () => {
  it.each([undefined, null])("reads %j as no brand", (brandId) => {
    const result = productCreationBodySchema.safeParse(validBody({ brandId }));

    expect(result).toMatchObject({ success: true, data: { brandId: null } });
  });

  it("keeps a brand id, in its canonical lowercase form", () => {
    const result = productCreationBodySchema.safeParse(
      validBody({ brandId: "D131EC62-1111-4AAA-8BBB-ABCDEF012345" }),
    );

    expect(result).toMatchObject({
      success: true,
      data: { brandId: "d131ec62-1111-4aaa-8bbb-abcdef012345" },
    });
  });

  it("rejects a malformed brandId", () => {
    const brandId = "not-an-id";
    expect(firstFailure(validBody({ brandId }))).toEqual({
      field: "brandId",
      message: "brandId must be an existing brand's id, or null for none",
    });
  });
});

describe("productCreationBodySchema, saleUnit", () => {
  it.each(SALE_UNITS)("accepts %s", (saleUnit) => {
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

  it("rejects a second internal code", () => {
    expect(firstFailure(validBody({ barcodes: ["2000000000015", "2000000000022"] }))).toEqual({
      field: "barcodes",
      message: "a product can have at most one internal barcode",
    });
  });

  it("accepts an internal code as the product's only code", () => {
    expect(isAccepted(validBody({ barcodes: ["2000000000015"] }))).toBe(true);
  });

  it("rejects an internal code listed beside another code", () => {
    expect(firstFailure(validBody({ barcodes: ["7790987000015", "2000000000015"] }))).toEqual({
      field: "barcodes",
      message: "a product is created with an internal barcode only as its sole barcode",
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

  it("keeps a net content's quantity and unit", () => {
    expect(
      productCreationBodySchema.safeParse(validBody({ netContent: { quantity: 1.5, unit: "KG" } }))
        .data?.netContent,
    ).toEqual({ quantity: 1.5, unit: "KG" });
  });

  it("rejects a malformed net content only once, never under netContentQuantity", () => {
    expect(failingFields(validBody({ netContent: { quantity: "0", unit: "KG" } }))).toEqual([
      "netContent",
    ]);
  });

  it("reports a quantity that is not valid under netContentQuantity, also when the saleUnit fails", () => {
    expect(
      failingFields(validBody({ saleUnit: "unit", netContent: { quantity: 0, unit: "KG" } })),
    ).toEqual(["saleUnit", "netContentQuantity"]);
  });
});

describe("productCreationBodySchema, tagIds", () => {
  it.each([undefined, []])("reads %j as no tags", (tagIds) => {
    expect(productCreationBodySchema.safeParse(validBody({ tagIds })).data).toMatchObject({
      tagIds: [],
    });
  });

  it("keeps several tag ids in the order sent, in their canonical lowercase form", () => {
    const result = productCreationBodySchema.safeParse(
      validBody({
        tagIds: ["D131EC62-1111-4AAA-8BBB-ABCDEF012345", "22222222-2222-2222-2222-222222222222"],
      }),
    );

    expect(result.data).toMatchObject({
      tagIds: ["d131ec62-1111-4aaa-8bbb-abcdef012345", "22222222-2222-2222-2222-222222222222"],
    });
  });

  it("rejects malformed tagIds", () => {
    expect(firstFailure(validBody({ tagIds: ["not-an-id"] }))).toEqual({
      field: "tagIds",
      message: "tagIds must be a list of existing tags' ids, [] for none",
    });
  });
});

describe("productCreationBodySchema, order and unknown keys", () => {
  it("reports the first failing field in the order name, categoryId, brandId, saleUnit, barcodes, tagIds, netContent", () => {
    const allInvalid = {
      name: "",
      categoryId: "",
      brandId: 42,
      saleUnit: "x",
      barcodes: [],
      tagIds: "x",
      netContent: "x",
    };

    expect(firstFailure(allInvalid)?.field).toBe("name");
    expect(firstFailure({ ...allInvalid, name: "a" })?.field).toBe("categoryId");
    expect(firstFailure({ ...allInvalid, name: "a", categoryId: CATEGORY_ID })?.field).toBe(
      "brandId",
    );
    expect(
      firstFailure({ ...allInvalid, name: "a", categoryId: CATEGORY_ID, brandId: null })?.field,
    ).toBe("saleUnit");
    const validUpToSaleUnit = { name: "a", categoryId: CATEGORY_ID, brandId: null, saleUnit: "KG" };
    expect(firstFailure({ ...allInvalid, ...validUpToSaleUnit })?.field).toBe("barcodes");
    expect(firstFailure({ ...allInvalid, ...validUpToSaleUnit, barcodes: ["1"] })?.field).toBe(
      "tagIds",
    );
    expect(
      firstFailure({ ...allInvalid, ...validUpToSaleUnit, barcodes: ["1"], tagIds: [] })?.field,
    ).toBe("netContent");
  });

  it("strips keys it does not know", () => {
    const result = productCreationBodySchema.safeParse(validBody({ version: 3, active: false }));

    expect(result.data).toEqual({
      name: "Maceta",
      categoryId: CATEGORY_ID,
      brandId: null,
      saleUnit: "UNIT",
      barcodes: ["111"],
      tagIds: [],
      netContent: null,
    });
  });

  it("reads a body without any field as failing on the name", () => {
    expect(firstFailure({})?.field).toBe("name");
  });

  it.each([null, undefined, "Maceta", 1, []])("rejects the body %j as not an object", (body) => {
    expect(isAccepted(body)).toBe(false);
  });
});

describe("productCreationBodySchema, declared limits and rules", () => {
  function barcodeRules(codes: string[]): unknown[] {
    const result = productCreationBodySchema.shape.barcodes.safeParse(codes);
    return result.success
      ? []
      : result.error.issues.map((issue) =>
          issue.code === "custom" ? issue.params?.["rule"] : undefined,
        );
  }

  it("declares the barcodes' maximum count and length", () => {
    expect(productCreationBodySchema.shape.barcodes.meta()).toEqual({
      maxCount: PRODUCT_BARCODES_MAX_COUNT,
      maxLength: BARCODE_MAX_LENGTH,
    });
  });

  it.each([
    ["too_many", Array.from({ length: PRODUCT_BARCODES_MAX_COUNT + 1 }, (_, index) => `c${index}`)],
    ["too_long", ["1".repeat(BARCODE_MAX_LENGTH + 1)]],
    ["whitespace", ["12 34"]],
    ["repeated", ["111", "111"]],
    ["several_internal", ["2000000000015", "2000000000022"]],
    ["internal_beside_others", ["2000000000015", "111"]],
  ])("names the %s problem of a barcode list", (problem, codes) => {
    expect(barcodeRules(codes)).toEqual([problem]);
  });
});
