import { describe, expect, it } from "vitest";
import { compareCodeUnits, compareSpanishText } from "./text-order.js";

describe("compareSpanishText", () => {
  it("orders text as a Spanish reader does, whatever its accents and case", () => {
    expect(["Yerba", "Ácido", "aceite", "Ñandú", "nuez"].sort(compareSpanishText)).toEqual([
      "aceite",
      "Ácido",
      "nuez",
      "Ñandú",
      "Yerba",
    ]);
  });

  it("finds equal text equal", () => {
    expect(compareSpanishText("Yerba", "Yerba")).toBe(0);
  });
});

describe("compareCodeUnits", () => {
  it("orders text by its characters' codes, whatever language a reader speaks", () => {
    expect(["b", "_", "a", "B", "1", "-", "ñ", "n"].sort(compareCodeUnits)).toEqual([
      "-",
      "1",
      "B",
      "_",
      "a",
      "b",
      "n",
      "ñ",
    ]);
  });

  it("puts a text before every longer text that starts with it", () => {
    expect(compareCodeUnits("2026-10", "2026-10-31")).toBeLessThan(0);
    expect(compareCodeUnits("2026-10-31", "2026-10")).toBeGreaterThan(0);
  });

  it("finds equal text equal", () => {
    expect(compareCodeUnits("credit_note_c", "credit_note_c")).toBe(0);
  });
});
