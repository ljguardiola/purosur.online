import { PACKAGING_NAME_MAX_LENGTH } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import {
  supplierPriceListRowProductCreatedSchema,
  supplierPriceListRowProductCreationBodySchema,
} from "./supplier-price-list-row-product-creation.js";

const CATEGORY_ID = "11111111-1111-1111-1111-111111111111";
const body = {
  version: 3,
  name: "Yerba 1 kg",
  saleUnit: "UNIT",
  categoryId: CATEGORY_ID,
  barcodes: ["7790001000012"],
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

  it("trims the names and the barcodes", () => {
    const parsed = supplierPriceListRowProductCreationBodySchema.safeParse({
      ...body,
      name: "  Yerba 1 kg ",
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

  it.each([undefined, "", "   ", 5, null])("rejects the name %j", (name) => {
    expect(firstFailure({ ...body, name })).toEqual({
      field: "name",
      message: "name must not be empty",
    });
  });

  it("rejects a product name longer than the catalog allows", () => {
    expect(firstFailure({ ...body, name: "a".repeat(1_000) })?.field).toBe("name");
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

  it.each([undefined, "", "   ", 5, null])("rejects the presentation name %j", (packagingName) => {
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
      supplierPriceListRowProductCreationBodySchema.safeParse({ ...body, brandId: "x", tagIds: [] })
        .data,
    ).toEqual(body);
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
