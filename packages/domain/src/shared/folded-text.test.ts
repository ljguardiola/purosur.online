import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { foldedText } from "./folded-text.js";

describe("foldedText", () => {
  it("lowers the case and removes the accents", () => {
    expect(foldedText("AZÚCAR Ñandú Pingüino")).toBe("azucar nandu pinguino");
  });

  it("removes the accent of a letter typed as base letter plus combining mark", () => {
    expect(foldedText("Café")).toBe("cafe");
  });

  it("removes a combining mark standing alone", () => {
    expect(foldedText("́")).toBe("");
  });

  it("keeps spaces, digits and punctuation as they are", () => {
    expect(foldedText("  Yerba\t1 kg, x10 ")).toBe("  yerba\t1 kg, x10 ");
  });

  it("is stable when applied twice", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        expect(foldedText(foldedText(text))).toBe(foldedText(text));
      }),
    );
  });
});
