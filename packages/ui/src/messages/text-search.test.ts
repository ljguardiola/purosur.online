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

test("ignores every combining mark, beyond the common accents", () => {
  expect(textContains("Ma\u1dc0te co\u1ab0cido", "mate cocido")).toBe(true);
  expect(textContains("mate cocido", "ma\u1dc0te")).toBe(true);
});

test("does not find text that does not contain the query", () => {
  expect(textContains("Aceto Balsámico", "vinagre")).toBe(false);
});
