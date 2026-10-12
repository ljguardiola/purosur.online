import { describe, expect, it } from "vitest";
import { saleDiscountLabel } from "./sale-discount-text";

describe("saleDiscountLabel", () => {
  it("names a percentage discount with its percentage", () => {
    expect(saleDiscountLabel({ kind: "PERCENT", value: 5, amount: 253_500 })).toBe(
      "Descuento sobre el total · 5 %",
    );
  });

  it("names a fixed amount discount without repeating its amount", () => {
    expect(saleDiscountLabel({ kind: "AMOUNT", value: 270_000, amount: 270_000 })).toBe(
      "Descuento sobre el total",
    );
  });
});
