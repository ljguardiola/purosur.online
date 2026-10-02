import { expect, test } from "vitest";
import {
  directedQuantity,
  formatStockChange,
  formatStockQuantity,
  parseStockQuantity,
} from "./stock-quantity";

test.each([
  [12_150, "KG", "12,150 kg"],
  [250, "KG", "0,250 kg"],
  [23_000, "UNIT", "23 u"],
  [0, "UNIT", "0 u"],
  [0, "KG", "0,000 kg"],
  [-4000, "UNIT", "− 4 u"],
  [-250, "KG", "− 0,250 kg"],
  [1_250_000, "UNIT", "1.250 u"],
  [12_345_000, "UNIT", "12.345 u"],
] as const)("shows %i thousandths of a %s product as %s", (quantity, saleUnit, text) => {
  expect(formatStockQuantity(quantity, saleUnit)).toBe(text);
});

test.each([
  [12_000, "UNIT", "+ 12 u"],
  [-1000, "UNIT", "− 1 u"],
  [-250, "KG", "− 0,250 kg"],
  [150, "KG", "+ 0,150 kg"],
  [0, "UNIT", "0 u"],
] as const)("shows a change of %i thousandths of a %s product as %s", (delta, saleUnit, text) => {
  expect(formatStockChange(delta, saleUnit)).toBe(text);
});

test.each([
  ["16", "UNIT", 16_000],
  ["1.250", "UNIT", 1_250_000],
  ["0", "UNIT", 0],
  ["4,300", "KG", 4300],
  ["4,3", "KG", 4300],
  ["12", "KG", 12_000],
  ["0,005", "KG", 5],
  [" 7,85 ", "KG", 7850],
] as const)("reads %j typed for a %s product as %i thousandths", (text, saleUnit, quantity) => {
  expect(parseStockQuantity(text, saleUnit)).toBe(quantity);
});

test.each([
  ["1,5", "UNIT"],
  ["", "KG"],
  ["-1", "KG"],
  ["1,0005", "KG"],
  ["1.5", "KG"],
  ["abc", "UNIT"],
] as const)("does not read %j typed for a %s product", (text, saleUnit) => {
  expect(parseStockQuantity(text, saleUnit)).toBeUndefined();
});

test.each([
  ["add", 2000, 2000],
  ["subtract", 250, -250],
] as const)(
  "turns a quantity moved in the %s direction, %i, into the change %i",
  (direction, quantity, change) => {
    expect(directedQuantity(direction, quantity)).toBe(change);
  },
);
