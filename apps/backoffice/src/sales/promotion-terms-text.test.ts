import { expect, test } from "vitest";
import { promotionTermsText } from "./promotion-terms-text";

const terms = {
  benefit: { kind: "BUY_N_PAY_M" as const, buyQty: 3, payQty: 2 },
  target: { kind: "PRODUCT" as const, name: "Yerba mate", brandName: null, netContent: null },
  weekdays: [],
};

test("writes no terms for a promotion that has none", () => {
  expect(promotionTermsText(null)).toBeNull();
});

test("writes what a promotion applies to and what it gives, every day of the week", () => {
  expect(promotionTermsText(terms)).toBe("Producto · Yerba mate · Lleve 3, pague 2");
  expect(promotionTermsText({ ...terms, weekdays: [1, 2, 3, 4, 5, 6, 7] })).toBe(
    "Producto · Yerba mate · Lleve 3, pague 2",
  );
});

test("adds the weekdays of a promotion that runs only some days", () => {
  expect(
    promotionTermsText({
      ...terms,
      benefit: { kind: "PERCENT_OFF", percent: 15 },
      target: { ...terms.target, kind: "CATEGORY", name: "Lácteos" },
      weekdays: [1, 3],
    }),
  ).toBe("Categoría · Lácteos · 15 % de descuento · Lunes y miércoles");
});
