import { expect, test } from "vitest";
import { cell } from "./spreadsheet/workbook";
import { stockQuantityCells } from "./stock-quantity-cells";

test("writes the units of a product sold by unit in the first cell and leaves the kilos empty", () => {
  expect(stockQuantityCells(23_000, "UNIT")).toEqual([cell.count(23), cell.empty()]);
});

test("writes the kilos of a product sold by weight in the second cell and leaves the units empty", () => {
  expect(stockQuantityCells(12_150, "KG")).toEqual([cell.empty(), cell.weight(12_150)]);
});
