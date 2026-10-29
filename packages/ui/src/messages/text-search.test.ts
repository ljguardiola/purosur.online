import { expect, test } from "vitest";
import { textContains } from "./text-search";

test("finds accented text from a query typed without accents", () => {
  expect(textContains("Aceto Balsámico Clasico", "Aceto Balsamico")).toBe(true);
});

test("finds unaccented text from a query typed with accents", () => {
  expect(textContains("Aceto Balsamico", "balsámico")).toBe(true);
});

test("ignores letter case and the diaeresis and tilde", () => {
  expect(textContains("PINGÜINO DE ÑANDÚ", "pinguino de nandu")).toBe(true);
});

test("does not find text that does not contain the query", () => {
  expect(textContains("Aceto Balsámico", "vinagre")).toBe(false);
});
