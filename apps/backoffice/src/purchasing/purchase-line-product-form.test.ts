import { purchaseLineProductChangeBodySchema } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import {
  EMPTY_PURCHASE_LINE_PRODUCT,
  PURCHASE_LINE_PRODUCT_FIELDS,
  purchaseLineProductMessage,
  purchaseLineProductRequestFrom,
} from "./purchase-line-product-form";
import { AVENA_PRODUCT_ID } from "./test-support/purchase-products";

describe("purchaseLineProductRequestFrom", () => {
  it("sends the product chosen", () => {
    const request = purchaseLineProductRequestFrom({ productId: AVENA_PRODUCT_ID });

    expect(request).toEqual({ productId: AVENA_PRODUCT_ID });
    expect(purchaseLineProductChangeBodySchema.safeParse(request).success).toBe(true);
  });

  it("sends no product as a body the shape refuses", () => {
    expect(
      purchaseLineProductChangeBodySchema.safeParse(
        purchaseLineProductRequestFrom(EMPTY_PURCHASE_LINE_PRODUCT),
      ).success,
    ).toBe(false);
  });
});

describe("the product form's field and messages", () => {
  it("starts without a product and lands the wire key on its field", () => {
    expect(EMPTY_PURCHASE_LINE_PRODUCT).toEqual({ productId: "" });
    expect(PURCHASE_LINE_PRODUCT_FIELDS).toEqual({ productId: "productId" });
  });

  it("asks to choose a product while none is chosen", () => {
    expect(purchaseLineProductMessage({ productId: "" })).toBe("Elegí el producto.");
  });

  it("says the product chosen does not take the line's quantity once one is chosen", () => {
    expect(purchaseLineProductMessage({ productId: AVENA_PRODUCT_ID })).toBe(
      "Este producto no se puede recibir en la cantidad de la línea. Elegí otro.",
    );
  });
});
