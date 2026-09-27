import { CATEGORY_NAME_MAX_LENGTH } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { categoryNameError } from "./categoryName";

describe("categoryNameError", () => {
  it("requires a name, rejecting a blank one", () => {
    expect(categoryNameError("")).toBe("Ingresá el nombre de la categoría.");
  });

  it("requires a name, rejecting a whitespace-only one", () => {
    expect(categoryNameError("   ")).toBe("Ingresá el nombre de la categoría.");
  });

  it("rejects a name of 101 characters", () => {
    expect(categoryNameError("a".repeat(101))).toBe(
      `El nombre puede tener hasta ${CATEGORY_NAME_MAX_LENGTH} caracteres.`,
    );
  });

  it("accepts a 100-character name surrounded by spaces, trimmed before the limit applies", () => {
    expect(categoryNameError(`  ${"a".repeat(100)}  `)).toBeUndefined();
  });

  it("accepts an ordinary name", () => {
    expect(categoryNameError("Almacén")).toBeUndefined();
  });
});
