import { purchaseLinesAdditionBodySchema } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { emptyPurchaseLine } from "./purchase-form";
import {
  emptyPurchaseLinesAddition,
  PURCHASE_LINES_ADDITION_FIELDS,
  purchaseLinesAdditionMessages,
  purchaseLinesAdditionRequestFrom,
} from "./purchase-lines-addition-form";
import { AVENA_PRODUCT_ID, purchasableProducts } from "./test-support/purchase-products";

describe("emptyPurchaseLinesAddition", () => {
  it("starts with one empty line", () => {
    expect(emptyPurchaseLinesAddition()).toEqual({ lines: [emptyPurchaseLine(1)] });
  });
});

describe("purchaseLinesAdditionRequestFrom", () => {
  it("builds each line the way a registration does", () => {
    const request = purchaseLinesAdditionRequestFrom(
      {
        lines: [
          {
            ...emptyPurchaseLine(1),
            productId: AVENA_PRODUCT_ID,
            quantity: "10",
            cost: "1.800",
          },
        ],
      },
      purchasableProducts,
    );

    expect(request).toEqual({
      lines: [
        {
          loadedBy: "quantity",
          productId: AVENA_PRODUCT_ID,
          quantity: 10_000,
          costPaidCents: 180_000,
          expiresOn: "",
        },
      ],
    });
    expect(purchaseLinesAdditionBodySchema.safeParse(request).success).toBe(true);
  });
});

describe("the lines form's field and message", () => {
  it("lands the wire key on its field", () => {
    expect(PURCHASE_LINES_ADDITION_FIELDS).toEqual({ lines: "lines" });
  });

  it("names the first line that is not valid, as the registration does", () => {
    const values = { lines: [{ ...emptyPurchaseLine(1) }] };

    expect(purchaseLinesAdditionMessages(purchasableProducts).lines(values)).toBe(
      "Línea 1: Elegí el producto.",
    );
  });
});
