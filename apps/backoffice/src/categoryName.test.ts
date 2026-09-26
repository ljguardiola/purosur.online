import { describe, expect, it } from "vitest";
import { categoryNameError } from "./categoryName";

describe("categoryNameError", () => {
  const modalMessages = {
    nameRequired: "required",
    nameTooLong: "too long",
  };

  it("requires a name, rejecting a blank one", () => {
    expect(categoryNameError("", modalMessages)).toBe("required");
  });

  it("requires a name, rejecting a whitespace-only one", () => {
    expect(categoryNameError("   ", modalMessages)).toBe("required");
  });

  it("rejects a name of 101 characters", () => {
    expect(categoryNameError("a".repeat(101), modalMessages)).toBe("too long");
  });

  it("accepts a 100-character name surrounded by spaces, trimmed before the limit applies", () => {
    expect(categoryNameError(`  ${"a".repeat(100)}  `, modalMessages)).toBeUndefined();
  });

  it("accepts an ordinary name", () => {
    expect(categoryNameError("Almacén", modalMessages)).toBeUndefined();
  });
});
