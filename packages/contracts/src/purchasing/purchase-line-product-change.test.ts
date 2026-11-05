import { describe, expect, it } from "vitest";
import { purchaseLineProductChangeBodySchema } from "./purchase-line-product-change.js";

const PRODUCT_ID = "22222222-2222-2222-2222-222222222222";

describe("purchaseLineProductChangeBodySchema", () => {
  it("accepts a product id", () => {
    expect(purchaseLineProductChangeBodySchema.safeParse({ productId: PRODUCT_ID }).data).toEqual({
      productId: PRODUCT_ID,
    });
  });

  it("takes the product id in lower case", () => {
    expect(
      purchaseLineProductChangeBodySchema.safeParse({ productId: PRODUCT_ID.toUpperCase() }).data,
    ).toEqual({ productId: PRODUCT_ID });
  });

  it.each([undefined, null, "", "nope", 7])("rejects the product id %j", (productId) => {
    const result = purchaseLineProductChangeBodySchema.safeParse({ productId });

    expect(result.error?.issues[0]).toMatchObject({
      path: ["productId"],
      message: "productId must be a product's id",
    });
  });

  it("takes nothing but the product id", () => {
    expect(
      purchaseLineProductChangeBodySchema.parse({ productId: PRODUCT_ID, quantity: 1_000 }),
    ).toEqual({ productId: PRODUCT_ID });
  });
});
