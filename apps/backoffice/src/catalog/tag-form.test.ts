import { TAG_NAME_MAX_LENGTH } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { renameReachText, tagEditRequestFrom, tagNameMessage } from "./tag-form";

describe("tagNameMessage", () => {
  it("asks for a name when it is blank or only spaces", () => {
    expect(tagNameMessage({ name: "" })).toBe("Ingresá el nombre del distintivo.");
    expect(tagNameMessage({ name: "   " })).toBe("Ingresá el nombre del distintivo.");
  });

  it("names the limit when it has 101 characters", () => {
    expect(tagNameMessage({ name: "a".repeat(101) })).toBe(
      `El nombre puede tener hasta ${TAG_NAME_MAX_LENGTH} caracteres.`,
    );
  });

  it("asks to review a name that passes every local check, trimmed before the limit applies", () => {
    expect(tagNameMessage({ name: `  ${"a".repeat(100)}  ` })).toBe(
      "Revisá el nombre del distintivo.",
    );
    expect(tagNameMessage({ name: "Vegano" })).toBe("Revisá el nombre del distintivo.");
  });
});

describe("renameReachText", () => {
  it("says nothing for a tag on no product", () => {
    expect(renameReachText(0)).toBeUndefined();
  });

  it("names the one product, or how many products, show the new name", () => {
    expect(renameReachText(1)).toBe("El nombre nuevo se ve en su producto.");
    expect(renameReachText(34)).toBe("El nombre nuevo se ve en sus 34 productos.");
    expect(renameReachText(1200)).toBe("El nombre nuevo se ve en sus 1.200 productos.");
  });
});

describe("tagEditRequestFrom", () => {
  it("sends the trimmed name with the version it was loaded at", () => {
    expect(tagEditRequestFrom({ name: "  Vegano ", version: 3 })).toEqual({
      name: "Vegano",
      version: 3,
    });
  });
});
