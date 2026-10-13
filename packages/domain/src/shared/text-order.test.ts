import { describe, expect, it } from "vitest";
import { compareSpanishText } from "./text-order.js";

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
