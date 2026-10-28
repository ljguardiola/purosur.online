import {
  NET_CONTENT_QUANTITY_MAX,
  NET_CONTENT_QUANTITY_MAX_DECIMALS,
  PACKAGING_NAME_MAX_LENGTH,
  PRODUCT_NAME_MAX_LENGTH,
} from "@purosur/domain";
import { describe, expect, it } from "vitest";
import {
  supplierPriceListRowProductCreatedSchema,
  supplierPriceListRowProductCreationBodySchema,
} from "./supplier-price-list-row-product-creation.js";

const CATEGORY_ID = "11111111-1111-1111-1111-111111111111";
const BRAND_ID = "22222222-2222-2222-2222-222222222222";
const TAG_ID = "33333333-3333-3333-3333-333333333333";
const body = {
  version: 3,
  name: "Aceite de almendras",
  saleUnit: "UNIT",
  categoryId: CATEGORY_ID,
  brandId: null,
  barcodes: ["7790001000012"],
  tagIds: [],
  netContent: null,
  packagingName: "Caja x 10",
  quantityPerPackage: 10_000,
  vatRate: 2100,
};

function firstFailure(candidate: unknown): { field: unknown; message: unknown } | undefined {
  const result = supplierPriceListRowProductCreationBodySchema.safeParse(candidate);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { field: issue.path[0], message: issue.message };
}

describe("supplierPriceListRowProductCreationBodySchema", () => {
  it("reads the version loaded, the product, its presentation and the rate", () => {
    expect(supplierPriceListRowProductCreationBodySchema.safeParse(body).data).toEqual(body);
  });

  it("trims the presentation's name and the barcodes", () => {
    const parsed = supplierPriceListRowProductCreationBodySchema.safeParse({
      ...body,
      packagingName: " Caja x 10  ",
      barcodes: [" 7790001000012 "],
    });

    expect(parsed.data).toEqual(body);
  });

  it.each([null, undefined])("reads the rate %j as none", (vatRate) => {
    expect(
      supplierPriceListRowProductCreationBodySchema.safeParse({ ...body, vatRate }).data?.vatRate,
    ).toBeNull();
  });

  it.each([21, 0, "2100", true])("refuses the rate %j", (vatRate) => {
    expect(firstFailure({ ...body, vatRate })).toEqual({
      field: "vatRate",
      message: "vatRate must be one of the VAT rates offered, in basis points",
    });
  });

  it.each([undefined, 0, -1, 1.5, "1", null])("rejects the version %j", (version) => {
    expect(firstFailure({ ...body, version })?.field).toBe("version");
  });

  it.each([undefined, "", "KILO", 1])("rejects the sale unit %j", (saleUnit) => {
    expect(firstFailure({ ...body, saleUnit })).toEqual({
      field: "saleUnit",
      message: "saleUnit must be UNIT or KG",
    });
  });

  it("accepts KG as the sale unit", () => {
    expect(
      supplierPriceListRowProductCreationBodySchema.safeParse({ ...body, saleUnit: "KG" }).data
        ?.saleUnit,
    ).toBe("KG");
  });

  it.each([undefined, "", "not-a-uuid", 42])("rejects the category %j", (categoryId) => {
    expect(firstFailure({ ...body, categoryId })).toEqual({
      field: "categoryId",
      message: "categoryId must be an existing category's id",
    });
  });

  it.each([undefined, [], [""], ["a b"], ["111", "111"]])(
    "rejects the barcodes %j like a product's creation does",
    (barcodes) => {
      expect(firstFailure({ ...body, barcodes })?.field).toBe("barcodes");
    },
  );

  it.each([null, undefined])("reads the presentation name %j as none", (packagingName) => {
    expect(
      supplierPriceListRowProductCreationBodySchema.safeParse({ ...body, packagingName }).data
        ?.packagingName,
    ).toBeNull();
  });

  it.each(["", "   ", 5])("rejects the presentation name %j", (packagingName) => {
    expect(firstFailure({ ...body, packagingName })).toEqual({
      field: "packagingName",
      message: `packagingName must be a non-empty string of at most ${PACKAGING_NAME_MAX_LENGTH} characters`,
    });
  });

  it("accepts a presentation name of exactly the maximum length and rejects a longer one", () => {
    expect(
      supplierPriceListRowProductCreationBodySchema.safeParse({
        ...body,
        packagingName: "a".repeat(PACKAGING_NAME_MAX_LENGTH),
      }).success,
    ).toBe(true);
    expect(
      firstFailure({ ...body, packagingName: "a".repeat(PACKAGING_NAME_MAX_LENGTH + 1) })?.field,
    ).toBe("packagingName");
  });

  it("tells a form how long the presentation's name may be", () => {
    expect(supplierPriceListRowProductCreationBodySchema.shape.packagingName.meta()).toEqual({
      maxLength: PACKAGING_NAME_MAX_LENGTH,
    });
  });

  it.each([undefined, null, "12", 0, -1000, 1.5])(
    "rejects the quantity %j",
    (quantityPerPackage) => {
      expect(firstFailure({ ...body, quantityPerPackage })).toEqual({
        field: "quantityPerPackage",
        message: "quantityPerPackage must be a positive integer number of thousandths",
      });
    },
  );

  it("strips keys it does not know", () => {
    expect(
      supplierPriceListRowProductCreationBodySchema.safeParse({ ...body, unknown: "x" }).data,
    ).toEqual(body);
  });

  it("reads the product's name trimmed", () => {
    expect(
      supplierPriceListRowProductCreationBodySchema.safeParse({ ...body, name: "  Yerba  " }).data
        ?.name,
    ).toBe("Yerba");
  });

  it.each([undefined, "", "   ", 5, null])("rejects the name %j", (name) => {
    expect(firstFailure({ ...body, name })).toEqual({
      field: "name",
      message: "name must not be empty",
    });
  });

  it("accepts a name of exactly the maximum length and rejects a longer one", () => {
    expect(
      supplierPriceListRowProductCreationBodySchema.safeParse({
        ...body,
        name: "a".repeat(PRODUCT_NAME_MAX_LENGTH),
      }).success,
    ).toBe(true);
    expect(firstFailure({ ...body, name: "a".repeat(PRODUCT_NAME_MAX_LENGTH + 1) })).toEqual({
      field: "name",
      message: `name must be at most ${PRODUCT_NAME_MAX_LENGTH} characters`,
    });
  });

  it("tells a form how long the product's name may be", () => {
    expect(supplierPriceListRowProductCreationBodySchema.shape.name.meta()).toEqual({
      maxLength: PRODUCT_NAME_MAX_LENGTH,
    });
  });

  it("keeps the brand id, or reads a missing one as no brand", () => {
    expect(
      supplierPriceListRowProductCreationBodySchema.safeParse({ ...body, brandId: BRAND_ID }).data
        ?.brandId,
    ).toBe(BRAND_ID);
    expect(
      supplierPriceListRowProductCreationBodySchema.safeParse({ ...body, brandId: undefined }).data
        ?.brandId,
    ).toBeNull();
  });

  it.each(["", "not-a-uuid", 42])("rejects the brand %j", (brandId) => {
    expect(firstFailure({ ...body, brandId })).toEqual({
      field: "brandId",
      message: "brandId must be an existing brand's id, or null for none",
    });
  });

  it("keeps the tag ids in the order sent, or reads missing ones as none", () => {
    const other = "44444444-4444-4444-4444-444444444444";
    expect(
      supplierPriceListRowProductCreationBodySchema.safeParse({
        ...body,
        tagIds: [other, TAG_ID],
      }).data?.tagIds,
    ).toEqual([other, TAG_ID]);
    expect(
      supplierPriceListRowProductCreationBodySchema.safeParse({ ...body, tagIds: undefined }).data
        ?.tagIds,
    ).toEqual([]);
  });

  it.each([["not-a-uuid"], "x", [42]])("rejects the tag ids %j", (tagIds) => {
    expect(firstFailure({ ...body, tagIds })).toEqual({
      field: "tagIds",
      message: "tagIds must be a list of existing tags' ids, [] for none",
    });
  });

  it("rejects a repeated tag", () => {
    expect(firstFailure({ ...body, tagIds: [TAG_ID, TAG_ID] })).toEqual({
      field: "tagIds",
      message: "tagIds must not repeat a tag",
    });
  });

  it("keeps a net content's quantity and unit", () => {
    expect(
      supplierPriceListRowProductCreationBodySchema.safeParse({
        ...body,
        netContent: { quantity: 125, unit: "ML", extra: true },
      }).data?.netContent,
    ).toEqual({ quantity: 125, unit: "ML" });
  });

  it.each(["125 ml", { quantity: "125", unit: "ML" }, { quantity: 125, unit: "LB" }])(
    "rejects the malformed net content %j",
    (netContent) => {
      expect(firstFailure({ ...body, netContent })).toEqual({
        field: "netContent",
        message: "netContent must be an object with a quantity and a listed unit, or absent/null",
      });
    },
  );

  it.each([0, -1, 1.0001, NET_CONTENT_QUANTITY_MAX + 1, Infinity])(
    "reports the net content's quantity %s under netContentQuantity",
    (quantity) => {
      expect(firstFailure({ ...body, netContent: { quantity, unit: "KG" } })).toEqual({
        field: "netContentQuantity",
        message: `netContent's quantity must be a positive number of at most ${NET_CONTENT_QUANTITY_MAX_DECIMALS} decimals, at most ${NET_CONTENT_QUANTITY_MAX}`,
      });
    },
  );

  it("reports a malformed net content only once, never under netContentQuantity", () => {
    const result = supplierPriceListRowProductCreationBodySchema.safeParse({
      ...body,
      netContent: { quantity: "0", unit: "KG" },
    });

    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(["netContent"]);
  });
});

describe("supplierPriceListRowProductCreatedSchema", () => {
  const created = { productId: "product-1", packagingId: "packaging-1" };

  it("reads the new product and its presentation", () => {
    expect(supplierPriceListRowProductCreatedSchema.safeParse(created).data).toEqual(created);
  });

  it.each(["productId", "packagingId"])("requires %s", (field) => {
    expect(
      supplierPriceListRowProductCreatedSchema.safeParse({ ...created, [field]: undefined })
        .success,
    ).toBe(false);
  });
});
