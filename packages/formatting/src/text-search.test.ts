import { expect, test } from "vitest";
import { foldedText, textContainsEveryWord } from "./text-search.js";

test("drops accents, the diaeresis and the tilde", () => {
  expect(foldedText("balsámico pingüino ñandú")).toBe("balsamico pinguino nandu");
});

test("drops every combining mark, beyond the common accents", () => {
  expect(foldedText("Ma᷀te co᪰cido")).toBe("mate cocido");
});

test("lowers the letter case", () => {
  expect(foldedText("ACEITE De Almendras")).toBe("aceite de almendras");
});

test("finds text holding every word of the query, in any order and apart", () => {
  expect(textContainsEveryWord("Aceite de Almendras Vitora 60 ml", "almendras 60 ml")).toBe(true);
  expect(textContainsEveryWord("Aceite de Almendras Vitora 60 ml", "60 VITORA")).toBe(true);
});

test("finds each word inside a longer word, ignoring accents and case", () => {
  expect(textContainsEveryWord("Aceto Balsámico Clásico", "balsam CLASI")).toBe(true);
});

test("does not find text missing one word of the query", () => {
  expect(textContainsEveryWord("Aceite de Almendras Vitora 30 ml", "vitora 60")).toBe(false);
});

test("ignores repeated spaces and spaces around the query", () => {
  expect(textContainsEveryWord("Aceite de Almendras Vitora 60 ml", "  vitora   60 ")).toBe(true);
});

test("finds any text from a blank query", () => {
  expect(textContainsEveryWord("Aceite de Almendras", "   ")).toBe(true);
});
