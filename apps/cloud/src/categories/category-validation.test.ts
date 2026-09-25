import { describe, expect, it } from "vitest";
import { categoryNameValidationFailure, readCategoryName } from "./category-validation.js";

describe("readCategoryName", () => {
  it("reads a trimmed name from the request body", () => {
    expect(readCategoryName({ name: "  Semillas  " })).toBe("Semillas");
  });

  it("reads undefined when the name is missing, not a string, or blank after trimming", () => {
    expect(readCategoryName({})).toBeUndefined();
    expect(readCategoryName({ name: 42 })).toBeUndefined();
    expect(readCategoryName({ name: "   " })).toBeUndefined();
  });
});

describe("categoryNameValidationFailure", () => {
  it("rejects an empty or missing name", () => {
    expect(categoryNameValidationFailure(undefined)).toMatchObject({ field: "name" });
  });

  it("accepts a non-empty name", () => {
    expect(categoryNameValidationFailure("Semillas")).toBeUndefined();
  });

  it("accepts a name of exactly 100 characters", () => {
    expect(categoryNameValidationFailure("a".repeat(100))).toBeUndefined();
  });

  it("rejects a name longer than 100 characters", () => {
    expect(categoryNameValidationFailure("a".repeat(101))).toMatchObject({ field: "name" });
  });
});
