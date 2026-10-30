import { expect, test } from "vitest";
import { foldedText } from "./text-search.js";

test("drops accents, the diaeresis and the tilde", () => {
  expect(foldedText("balsámico pingüino ñandú")).toBe("balsamico pinguino nandu");
});

test("drops every combining mark, beyond the common accents", () => {
  expect(foldedText("Ma᷀te co᪰cido")).toBe("mate cocido");
});

test("lowers the letter case", () => {
  expect(foldedText("ACEITE De Almendras")).toBe("aceite de almendras");
});
