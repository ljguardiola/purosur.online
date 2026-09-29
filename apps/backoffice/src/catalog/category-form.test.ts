import { CATEGORY_NAME_MAX_LENGTH } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { categoryNameMessage } from "./category-form";

describe("categoryNameMessage", () => {
  it("asks for a name when it is blank", () => {
    expect(categoryNameMessage({ name: "" })).toBe("Ingresá el nombre de la categoría.");
  });

  it("asks for a name when it is only spaces", () => {
    expect(categoryNameMessage({ name: "   " })).toBe("Ingresá el nombre de la categoría.");
  });

  it("names the limit when it has 101 characters", () => {
    expect(categoryNameMessage({ name: "a".repeat(101) })).toBe(
      `El nombre puede tener hasta ${CATEGORY_NAME_MAX_LENGTH} caracteres.`,
    );
  });

  it("asks to review a name that passes every local check, trimmed before the limit applies", () => {
    expect(categoryNameMessage({ name: `  ${"a".repeat(100)}  ` })).toBe(
      "Revisá el nombre de la categoría.",
    );
    expect(categoryNameMessage({ name: "Almacén" })).toBe("Revisá el nombre de la categoría.");
  });
});
