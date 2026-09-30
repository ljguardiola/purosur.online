import { expect, test } from "vitest";
import { discountsFooterText } from "./discounts-footer-text";

test("counts the promotions shown and how many of them apply today", () => {
  expect(discountsFooterText({ shown: 5, current: 3 })).toBe("5 promociones · 3 vigentes hoy");
});

test("uses the singular for one promotion and for one current promotion", () => {
  expect(discountsFooterText({ shown: 1, current: 1 })).toBe("1 promoción · 1 vigente hoy");
});

test("says none apply today when the shown promotions are not current", () => {
  expect(discountsFooterText({ shown: 2, current: 0 })).toBe("2 promociones · 0 vigentes hoy");
});

test("groups thousands the Argentine way", () => {
  expect(discountsFooterText({ shown: 1200, current: 1000 })).toBe(
    "1.200 promociones · 1.000 vigentes hoy",
  );
});
