import { describe, expect, it } from "vitest";
import {
  compareCodeUnits,
  compareOptionalNames,
  compareSpanishPaths,
  compareSpanishText,
} from "./text-order.js";

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

  it("orders the numbers inside a text by their value", () => {
    expect(["Caja 10", "Caja 2", "Caja 1"].sort(compareSpanishText)).toEqual([
      "Caja 1",
      "Caja 2",
      "Caja 10",
    ]);
  });

  it("puts a name next to the same name in another case and before a later name", () => {
    expect(["Zoe", "Ana", "ana"].sort(compareSpanishText)).toEqual(["ana", "Ana", "Zoe"]);
  });
});

describe("compareOptionalNames", () => {
  it("puts a missing name after every name", () => {
    expect([null, "Zoe", "ana", "Caja 10", "Caja 2"].sort(compareOptionalNames)).toEqual([
      "ana",
      "Caja 2",
      "Caja 10",
      "Zoe",
      null,
    ]);
  });

  it("finds two missing names equal", () => {
    expect(compareOptionalNames(null, null)).toBe(0);
  });
});

describe("compareSpanishPaths", () => {
  it("orders paths segment by segment as a Spanish reader does", () => {
    const paths = [["Bebidas", "Jugos"], ["bebidas", "Agua"], ["Almacén"], ["Piso 10"], ["Piso 2"]];
    expect(paths.sort(compareSpanishPaths)).toEqual([
      ["Almacén"],
      ["bebidas", "Agua"],
      ["Bebidas", "Jugos"],
      ["Piso 2"],
      ["Piso 10"],
    ]);
  });

  it("puts a path before every longer path it begins", () => {
    expect(compareSpanishPaths(["Bebidas"], ["Bebidas", "Agua"])).toBeLessThan(0);
    expect(compareSpanishPaths(["Bebidas", "Agua"], ["Bebidas"])).toBeGreaterThan(0);
  });

  it("finds equal paths equal", () => {
    expect(compareSpanishPaths(["Bebidas", "Agua"], ["Bebidas", "Agua"])).toBe(0);
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
