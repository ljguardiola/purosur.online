import { describe, expect, it } from "vitest";
import {
  EMPTY_SALE_DISCOUNT_FORM,
  previewSaleDiscountFrom,
  saleDiscountFormRequestSchema,
  saleDiscountRequestFrom,
  saleDiscountValueMessage,
} from "./sale-discount-form";

describe("saleDiscountRequestFrom", () => {
  it("reads a typed amount as cents", () => {
    const request = saleDiscountRequestFrom({
      kind: "AMOUNT",
      value: "2.700,50",
      reason: "Compra grande",
    });

    expect(request).toEqual({
      discount: { kind: "AMOUNT", value: 270_050 },
      reason: "Compra grande",
    });
    expect(saleDiscountFormRequestSchema.safeParse(request).success).toBe(true);
  });

  it("reads a typed percentage as a whole number", () => {
    const request = saleDiscountRequestFrom({
      kind: "PERCENT",
      value: "5",
      reason: "Cliente frecuente",
    });

    expect(request.discount).toEqual({ kind: "PERCENT", value: 5 });
    expect(saleDiscountFormRequestSchema.safeParse(request).success).toBe(true);
  });

  it.each([
    ["AMOUNT", ""],
    ["AMOUNT", "5,"],
    ["AMOUNT", "0"],
    ["PERCENT", ""],
    ["PERCENT", "5,5"],
    ["PERCENT", "0"],
    ["PERCENT", "101"],
  ] as const)("has the shape refuse %s %j", (kind, value) => {
    const request = saleDiscountRequestFrom({ kind, value, reason: "Motivo" });

    expect(saleDiscountFormRequestSchema.safeParse(request).success).toBe(false);
  });

  it("has the shape refuse a reason with only blanks", () => {
    const request = saleDiscountRequestFrom({
      ...EMPTY_SALE_DISCOUNT_FORM,
      value: "5",
      reason: "   ",
    });

    expect(saleDiscountFormRequestSchema.safeParse(request).success).toBe(false);
  });

  it("starts as a percentage discount with nothing typed", () => {
    expect(EMPTY_SALE_DISCOUNT_FORM).toEqual({ kind: "PERCENT", value: "", reason: "" });
  });
});

describe("saleDiscountValueMessage", () => {
  it("tells how to type each kind of value", () => {
    expect(saleDiscountValueMessage("AMOUNT")).toBe(
      "Ingresá un descuento mayor a 0, por ejemplo 500,00.",
    );
    expect(saleDiscountValueMessage("PERCENT")).toBe(
      "Ingresá un porcentaje entero, por ejemplo 10.",
    );
  });
});

describe("previewSaleDiscountFrom", () => {
  it.each([
    ["AMOUNT", "2.700", { kind: "AMOUNT", value: 270_000 }],
    ["PERCENT", "5", { kind: "PERCENT", value: 5 }],
    ["PERCENT", "100", { kind: "PERCENT", value: 100 }],
  ] as const)("reads %s %j as the discount to preview", (kind, value, expected) => {
    expect(previewSaleDiscountFrom({ kind, value })).toEqual(expected);
  });

  it.each([
    ["AMOUNT", ""],
    ["AMOUNT", "0"],
    ["PERCENT", ""],
    ["PERCENT", "5,5"],
    ["PERCENT", "0"],
    ["PERCENT", "101"],
  ] as const)("previews nothing for %s %j", (kind, value) => {
    expect(previewSaleDiscountFrom({ kind, value })).toBeUndefined();
  });
});
