import { TAG_NAME_MAX_LENGTH } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { tagNameMessage } from "./tag-name";

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
