import {
  MAX_STOCK_QUANTITY,
  PACKAGING_NAME_MAX_LENGTH,
  STOCK_QUANTITY_DECIMALS,
  STOCK_QUANTITY_PER_UNIT,
} from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { packagingCreationBodySchema } from "./packaging-creation.js";

const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";
const NAME_MESSAGE = `name must be a non-empty string of at most ${PACKAGING_NAME_MAX_LENGTH} characters`;
const QUANTITY_MESSAGE = "quantityPerPackage must be a positive integer number of thousandths";

const packaging = { productId: PRODUCT_ID, name: "Caja x 12", quantityPerPackage: 12_000 };

function firstFailure(body: unknown): { field: unknown; message: unknown } | undefined {
  const result = packagingCreationBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { field: issue.path[0], message: issue.message };
}

describe("packagingCreationBodySchema", () => {
  it("accepts a product, a name and a quantity, trimming the name", () => {
    expect(
      packagingCreationBodySchema.safeParse({ ...packaging, name: "  Caja x 12 " }).data,
    ).toEqual(packaging);
  });

  it("reads a product id in upper case in lower case", () => {
    expect(
      packagingCreationBodySchema.parse({
        ...packaging,
        productId: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE",
      }).productId,
    ).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  });

  it.each([undefined, "", "not-a-uuid", 42])("rejects the product id %j", (productId) => {
    expect(firstFailure({ ...packaging, productId })).toEqual({
      field: "productId",
      message: "productId must be a product's id",
    });
  });

  it.each([undefined, "", "   ", 42, null])("rejects the name %j", (name) => {
    expect(firstFailure({ ...packaging, name })).toEqual({ field: "name", message: NAME_MESSAGE });
  });

  it("accepts a name of exactly the domain's maximum length and rejects a longer one", () => {
    expect(
      packagingCreationBodySchema.safeParse({
        ...packaging,
        name: "a".repeat(PACKAGING_NAME_MAX_LENGTH),
      }).success,
    ).toBe(true);
    expect(firstFailure({ ...packaging, name: "a".repeat(PACKAGING_NAME_MAX_LENGTH + 1) })).toEqual(
      { field: "name", message: NAME_MESSAGE },
    );
  });

  it("accepts the smallest and the largest quantity a stock movement may carry", () => {
    for (const quantityPerPackage of [1, MAX_STOCK_QUANTITY]) {
      expect(
        packagingCreationBodySchema.safeParse({ ...packaging, quantityPerPackage }).success,
      ).toBe(true);
    }
  });

  it.each([undefined, null, "12", 0, -1000, 1.5, MAX_STOCK_QUANTITY + 1, Number.NaN])(
    "rejects the quantity %j",
    (quantityPerPackage) => {
      expect(firstFailure({ ...packaging, quantityPerPackage })).toEqual({
        field: "quantityPerPackage",
        message: QUANTITY_MESSAGE,
      });
    },
  );

  it("declares the quantity's units and the name's maximum length", () => {
    expect(packagingCreationBodySchema.shape.quantityPerPackage.meta()).toEqual({
      decimals: STOCK_QUANTITY_DECIMALS,
      perUnit: STOCK_QUANTITY_PER_UNIT,
    });
    expect(packagingCreationBodySchema.shape.name.meta()).toEqual({
      maxLength: PACKAGING_NAME_MAX_LENGTH,
    });
  });

  it("strips keys it does not know", () => {
    expect(packagingCreationBodySchema.safeParse({ ...packaging, active: false }).data).toEqual(
      packaging,
    );
  });

  it.each([null, undefined, "Caja", 1, []])("rejects the body %j as not an object", (body) => {
    expect(packagingCreationBodySchema.safeParse(body).success).toBe(false);
  });
});
