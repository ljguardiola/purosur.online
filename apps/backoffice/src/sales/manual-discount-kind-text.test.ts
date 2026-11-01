import { expect, test } from "vitest";
import { manualDiscountKindName, manualDiscountKindText } from "./manual-discount-kind-text";
import { manualDiscountsReport } from "./test-support/sales-fixtures";

test("names a discount by where it applies, or as a new price", () => {
  expect(manualDiscountsReport.rows.map(manualDiscountKindName)).toEqual([
    "Sobre el total",
    "De línea",
    "De línea",
    "Precio nuevo",
  ]);
});

test("adds the amount or the percentage taken off to the name, never a new price", () => {
  expect(manualDiscountsReport.rows.map(manualDiscountKindText)).toEqual([
    "Sobre el total · $ 700,00",
    "De línea · 10 %",
    "De línea · $ 500,00",
    "Precio nuevo",
  ]);
});
