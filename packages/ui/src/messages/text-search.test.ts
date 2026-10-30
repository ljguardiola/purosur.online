import { expect, test } from "vitest";
import { textContains, textsContainEveryWord } from "./text-search";

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

test("finds text holding every word of the query, apart and in any order", () => {
  expect(textContains("Aceite de Almendras Vitora 60 ml", "almendras 60 ml")).toBe(true);
  expect(textContains("Aceite de Almendras Vitora 60 ml", "ml VITORA aceite")).toBe(true);
});

test("does not find text missing one of the query's words", () => {
  expect(textContains("Aceite de Almendras Vitora 60 ml", "almendras 125 ml")).toBe(false);
});

test("finds a word inside a longer word, as a single-word query does", () => {
  expect(textContains("Aceite de Almendras Vitora 60 ml", "almen vito")).toBe(true);
});

test("ignores the spaces around and between the query's words", () => {
  expect(textContains("Aceite de Almendras", "  almendras \t  aceite ")).toBe(true);
});

test("finds every word across several texts, each word in any one of them", () => {
  expect(textsContainEveryWord(["Aceite de Almendras", "7790001"], "almendras 77900")).toBe(true);
  expect(textsContainEveryWord(["Aceite de Almendras", "7790001"], "almendras 123")).toBe(false);
});

test("finds no text in an empty list of texts", () => {
  expect(textsContainEveryWord([], "almendras")).toBe(false);
});
