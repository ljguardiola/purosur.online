import { describe, expect, it } from "vitest";
import {
  categoryNameValidationFailure,
  readCategoryName,
  readParentId,
} from "./category-validation.js";

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

describe("readParentId", () => {
  it("reads null for an absent or explicitly null parentId, meaning top level", () => {
    expect(readParentId({})).toBeNull();
    expect(readParentId({ parentId: null })).toBeNull();
  });

  it("reads the id string for a non-empty string parentId", () => {
    expect(readParentId({ parentId: "11111111-1111-1111-1111-111111111111" })).toBe(
      "11111111-1111-1111-1111-111111111111",
    );
  });

  it("reads an id sent in uppercase in its canonical lowercase form", () => {
    expect(readParentId({ parentId: "D131EC62-1111-4AAA-8BBB-ABCDEF012345" })).toBe(
      "d131ec62-1111-4aaa-8bbb-abcdef012345",
    );
  });

  it("reads undefined for a malformed parentId (not a string, or an empty string)", () => {
    expect(readParentId({ parentId: 42 })).toBeUndefined();
    expect(readParentId({ parentId: "" })).toBeUndefined();
  });
});

describe("categoryNameValidationFailure", () => {
  it("rejects an empty or missing name", () => {
    expect(categoryNameValidationFailure(undefined)).toMatchObject({ field: "name" });
  });

  it("accepts a non-empty name", () => {
    expect(categoryNameValidationFailure("Semillas")).toBeUndefined();
  });
});
