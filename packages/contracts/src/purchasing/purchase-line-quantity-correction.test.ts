import { MAX_STOCK_QUANTITY } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { purchaseLineQuantityCorrectionBodySchema } from "./purchase-line-quantity-correction.js";

describe("purchaseLineQuantityCorrectionBodySchema", () => {
  it.each([1, 2_500, MAX_STOCK_QUANTITY])("accepts the quantity %j", (quantity) => {
    const body = { loadedBy: "quantity", quantity };

    expect(purchaseLineQuantityCorrectionBodySchema.safeParse(body).data).toEqual(body);
  });

  it.each([1, 3, MAX_STOCK_QUANTITY])("accepts the packages %j", (packages) => {
    const body = { loadedBy: "packages", packages };

    expect(purchaseLineQuantityCorrectionBodySchema.safeParse(body).data).toEqual(body);
  });

  it.each([
    undefined,
    null,
    "2500",
    0,
    -1_000,
    1.5,
    MAX_STOCK_QUANTITY + 1,
    Number.NaN,
  ])("rejects the quantity %j", (quantity) => {
    const result = purchaseLineQuantityCorrectionBodySchema.safeParse({
      loadedBy: "quantity",
      quantity,
    });

    expect(result.error?.issues[0]).toMatchObject({
      path: ["quantity"],
      message: "quantity must be a positive integer number of thousandths",
    });
  });

  it.each([
    undefined,
    null,
    "2",
    0,
    -1,
    1.5,
    MAX_STOCK_QUANTITY + 1,
    Number.NaN,
  ])("rejects the packages %j", (packages) => {
    const result = purchaseLineQuantityCorrectionBodySchema.safeParse({
      loadedBy: "packages",
      packages,
    });

    expect(result.error?.issues[0]).toMatchObject({
      path: ["packages"],
      message: "packages must be a positive whole number",
    });
  });

  it.each([undefined, "", "other", "packaging"])("rejects the way of loading %j", (loadedBy) => {
    expect(
      purchaseLineQuantityCorrectionBodySchema.safeParse({ loadedBy, quantity: 1_000 }).success,
    ).toBe(false);
  });

  it("does not take the quantity of each package, which a correction never changes", () => {
    const parsed = purchaseLineQuantityCorrectionBodySchema.parse({
      loadedBy: "packages",
      packages: 3,
      quantityPerPackage: 5_000,
    });

    expect(parsed).toEqual({ loadedBy: "packages", packages: 3 });
  });

  it("declares the units of the quantity", () => {
    const [, quantityBody] = purchaseLineQuantityCorrectionBodySchema.options;

    expect(quantityBody.shape.quantity.meta()).toEqual({ decimals: 3, perUnit: 1_000 });
  });
});
